# docker/compiler/Dockerfile
# SolFlow unified compiler image — builds Anchor, Pinocchio, and Quasar programs.
#
# How Solana PG does it (reference):
#   - Ubuntu 24.04 + Solana 1.17.34 + cargo-build-sbf
#   - anchor_syn for IDL parsing (server-side Rust)
#   - cargo-build-sbf --offline for compilation
#
# Our approach:
#   - Same base as Solana PG (Ubuntu 24.04 + Solana CLI)
#   - Anchor CLI for `anchor build` and `anchor idl parse`
#   - cargo-build-sbf for Pinocchio and Quasar (native Rust)
#   - Quasar lang crate available in Cargo.toml dependencies
#   - Pre-built template Cargo.toml with all common deps cached
#
# Build:   docker build -t solflow-compiler:latest docker/compiler/
# Test:    docker run --rm solflow-compiler:latest solana --version
#
# Resource limits applied at runtime (not here):
#   --memory=2g --cpus=2 --network=none

################# BASE IMAGE #################
FROM --platform=linux/amd64 ubuntu:24.04 AS base

ARG DEBIAN_FRONTEND="noninteractive"
ENV HOME="/root"

# System dependencies
RUN apt-get update -qq && apt-get upgrade -qq && apt-get install -qq \
    build-essential curl pkg-config libssl-dev libudev-dev \
    git clang make ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
ENV PATH="${HOME}/.cargo/bin:${PATH}"

ENV PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

# Verify cargo-build-sbf is available
RUN cargo-build-sbf --version

# Anchor CLI is already installed by the Solana install script (via avm)
RUN anchor --version

################# TEMPLATE CARGO.TOML (cached deps) #################
# Pre-cache common dependencies so builds are fast.
# This mirrors Solana PG's approach of having all deps pre-installed.
WORKDIR /home/builder

# Create template workspace for dependency caching
RUN mkdir -p /home/builder/template/programs/template/src

# Write template Cargo.toml with all supported dependencies
COPY programs/Cargo.toml /home/builder/template/programs/Cargo.toml
COPY programs/default/src/lib.rs /home/builder/template/programs/template/src/lib.rs

# Cache dependencies by doing a dummy build
WORKDIR /home/builder/template/programs
RUN cargo build-sbf 2>/dev/null || true
# Also cache anchor build
RUN cd /home/builder/template && anchor build 2>/dev/null || true

# Clean up template build artifacts but keep cached deps
RUN rm -rf /home/builder/template

################# RUNTIME USER #################
ENV PATH="/root/.cargo/bin:/root/.local/share/solana/install/active_release/bin:${PATH}"
RUN useradd -m builder
RUN chmod a+rx /root && chmod -R a+rx /root/.cargo /root/.local /root/.rustup /root/.avm /root/.nvm || true
USER builder
WORKDIR /home/builder/project


# Verify all tools are accessible as builder user
RUN  solana --version && anchor --version && cargo-build-sbf --version

# Default: keep container alive for builds
CMD ["sleep", "infinity"]
