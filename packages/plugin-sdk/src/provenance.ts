import type {
  PluginSignatureVerification,
  PluginTrustPolicy,
  SolFlowPlugin,
} from "./types";

export const PLUGIN_SIGNATURE_ALGORITHM = "ECDSA-P256-SHA256";

export function canonicalPluginManifest(plugin: SolFlowPlugin): string {
  return stableStringify(toSignableManifest(plugin));
}

export async function computePluginManifestDigest(plugin: SolFlowPlugin): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalPluginManifest(plugin));
  const digest = await getSubtleCrypto().digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyPluginSignature(
  plugin: SolFlowPlugin,
  policy: PluginTrustPolicy = {},
): Promise<PluginSignatureVerification> {
  const digest = await computePluginManifestDigest(plugin);
  const security = plugin.security;

  if (!security?.signature) {
    return { verified: false, digest, reason: "Plugin signature is missing" };
  }
  if (security.manifestDigest && security.manifestDigest !== digest) {
    return {
      verified: false,
      digest,
      publicKeyId: security.publicKeyId,
      algorithm: security.signatureAlgorithm,
      reason: "Plugin manifest digest does not match signed metadata",
    };
  }
  if (security.signatureAlgorithm && security.signatureAlgorithm !== PLUGIN_SIGNATURE_ALGORITHM) {
    return {
      verified: false,
      digest,
      publicKeyId: security.publicKeyId,
      algorithm: security.signatureAlgorithm,
      reason: `Unsupported plugin signature algorithm: ${security.signatureAlgorithm}`,
    };
  }
  if (!security.publicKeyId) {
    return { verified: false, digest, reason: "Plugin publicKeyId is missing" };
  }

  const publicKeyJwk = policy.trustedPublisherKeys?.[security.publicKeyId];
  if (!publicKeyJwk) {
    return {
      verified: false,
      digest,
      publicKeyId: security.publicKeyId,
      algorithm: security.signatureAlgorithm,
      reason: `No trusted publisher key for ${security.publicKeyId}`,
    };
  }

  const publicKey = await getSubtleCrypto().importKey(
    "jwk",
    publicKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signatureBytes = base64UrlDecode(security.signature);
  const verified = await getSubtleCrypto().verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    toArrayBuffer(signatureBytes),
    new TextEncoder().encode(canonicalPluginManifest(plugin)),
  );

  return {
    verified,
    digest,
    publicKeyId: security.publicKeyId,
    algorithm: security.signatureAlgorithm ?? PLUGIN_SIGNATURE_ALGORITHM,
    reason: verified ? undefined : "Plugin signature did not verify",
  };
}

export function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: { from(input: Uint8Array): { toString(encoding: "base64"): string } };
  };
  const encoded = typeof btoa === "function"
    ? btoa(binary)
    : globalWithBuffer.Buffer?.from(bytes).toString("base64");
  if (!encoded) throw new Error("No base64 encoder is available");
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: { from(input: string, encoding: "base64"): { toString(encoding: "binary"): string } };
  };
  const binary = typeof atob === "function"
    ? atob(padded)
    : globalWithBuffer.Buffer?.from(padded, "base64").toString("binary");
  if (!binary) throw new Error("No base64 decoder is available");
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toSignableManifest(plugin: SolFlowPlugin): unknown {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    author: plugin.author,
    icon: plugin.icon,
    website: plugin.website,
    security: plugin.security
      ? {
          trustLevel: plugin.security.trustLevel,
          publisher: plugin.security.publisher,
          verified: plugin.security.verified,
          audited: plugin.security.audited,
          signatureAlgorithm: plugin.security.signatureAlgorithm,
          publicKeyId: plugin.security.publicKeyId,
          provenance: plugin.security.provenance,
          publishedAt: plugin.security.publishedAt,
        }
      : undefined,
    nodes: plugin.nodes.map((node) => ({
      type: node.type,
      label: node.label,
      category: node.category,
      description: node.description,
      properties: node.properties,
      handles: node.handles,
      defaultData: node.defaultData,
    })),
    cargoDependencies: plugin.cargoDependencies,
    imports: plugin.imports,
  };
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const view = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return view instanceof ArrayBuffer ? view : new Uint8Array(bytes).buffer;
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto subtle crypto is required for plugin provenance verification");
  }
  return subtle;
}
