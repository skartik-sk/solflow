import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeOutboundUrl,
  assertSafeOutboundUrlResolved,
  isPrivateOrLocalHost,
  safeOutboundFetch,
  setOutboundResolver,
  withRequestTimeout,
} from "./outbound-url";

afterEach(() => {
  setOutboundResolver(undefined);
  vi.unstubAllGlobals();
  delete process.env.SOLFLOW_ALLOW_PRIVATE_OUTBOUND;
});

describe("assertSafeOutboundUrl", () => {
  it.each([
    "http://[::ffff:127.0.0.1]:9001/",
    "http://[::ffff:169.254.169.254]/",
    "http://[::ffff:7f00:1]/",
    "http://[::]/",
    "http://[::1]/",
    "http://[fd00:ec2::254]/",
    "http://[fe80::1]/",
    "http://[64:ff9b::7f00:1]/",
    "http://0.0.0.0/",
    "http://0.1.2.3/",
    "http://100.100.100.200/",
    "http://100.64.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://0x7f.1/",
    "http://2130706433/",
    "http://127.1/",
    "http://localhost:3000/",
    "http://metadata.google.internal/",
    "http://metadata/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.20.0.1/",
  ])("blocks %s", (url) => {
    expect(() => assertSafeOutboundUrl(url)).toThrow(/private or local/);
  });

  it.each([
    "https://fcc.gov/",
    "https://fd.example.com/",
    "https://fe80.example.com/",
    "https://api.jup.ag/swap",
    "https://8.8.8.8/",
    "https://[2606:4700:4700::1111]/",
    "https://100.128.0.1/",
  ])("allows %s", (url) => {
    expect(() => assertSafeOutboundUrl(url)).not.toThrow();
  });

  it("only applies the fc/fd ULA rule to IPv6 literals", () => {
    expect(isPrivateOrLocalHost("fcc.gov")).toBe(false);
    expect(isPrivateOrLocalHost("fd.io")).toBe(false);
    expect(isPrivateOrLocalHost("[fc00::1]")).toBe(true);
  });
});

describe("assertSafeOutboundUrlResolved", () => {
  it("rejects names that resolve to private addresses (nip.io style)", async () => {
    setOutboundResolver(async (host) => (host === "127.0.0.1.nip.io" ? ["127.0.0.1"] : ["93.184.216.34"]));
    await expect(assertSafeOutboundUrlResolved("http://127.0.0.1.nip.io/")).rejects.toThrow(
      /resolves to a private/,
    );
  });

  it("rejects when any resolved address is private", async () => {
    setOutboundResolver(async () => ["93.184.216.34", "::ffff:10.0.0.5"]);
    await expect(assertSafeOutboundUrlResolved("https://mixed.example.com/")).rejects.toThrow(
      /resolves to a private/,
    );
  });

  it("rejects unresolvable hosts", async () => {
    setOutboundResolver(async () => {
      throw new Error("ENOTFOUND");
    });
    await expect(assertSafeOutboundUrlResolved("https://nope.example.com/")).rejects.toThrow(
      /could not be resolved/,
    );
  });

  it("allows public names and skips DNS when private outbound is allowed", async () => {
    setOutboundResolver(async () => ["93.184.216.34"]);
    await expect(assertSafeOutboundUrlResolved("https://example.com/")).resolves.toBeInstanceOf(URL);

    process.env.SOLFLOW_ALLOW_PRIVATE_OUTBOUND = "1";
    const resolver = vi.fn(async () => ["127.0.0.1"]);
    setOutboundResolver(resolver);
    await expect(assertSafeOutboundUrlResolved("http://localhost:8899/")).resolves.toBeInstanceOf(URL);
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe("safeOutboundFetch", () => {
  it("re-validates every redirect hop and refuses private targets", async () => {
    setOutboundResolver(async () => ["93.184.216.34"]);
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeOutboundFetch("https://example.com/hook")).rejects.toThrow(/private or local/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("follows at most 3 redirects", async () => {
    setOutboundResolver(async () => ["93.184.216.34"]);
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 301, headers: { location: "https://example.com/again" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeOutboundFetch("https://example.com/")).rejects.toThrow(/exceeded 3 redirects/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("follows a safe redirect, switches POST to GET on 303 and drops auth cross-origin", async () => {
    setOutboundResolver(async () => ["93.184.216.34"]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: "https://other.example.org/done" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await safeOutboundFetch("https://example.com/hook", {
      method: "POST",
      body: "{}",
      headers: { Authorization: "Bearer secret", "Content-Type": "application/json" },
    });
    expect(await response.text()).toBe("ok");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://other.example.org/done");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });
});

describe("withRequestTimeout", () => {
  it("aborts after the timeout and follows the parent signal", async () => {
    const timed = withRequestTimeout(undefined, 5);
    await new Promise((r) => setTimeout(r, 20));
    expect(timed.aborted).toBe(true);

    const parent = new AbortController();
    const merged = withRequestTimeout(parent.signal, 10_000);
    parent.abort(new Error("run cancelled"));
    expect(merged.aborted).toBe(true);
  });
});
