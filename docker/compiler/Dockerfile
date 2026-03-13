# docker/compiler/Dockerfile
# Solana smart-contract compiler image.
# Used by the BullMQ worker to build Anchor and Pinocchio programs.
#
# Resource limits applied at container runtime (not here):
#   --memory=2g --cpus=2 --network=none (build phase)
#
# Build this image once and cache it:
#   docker build -t solflow-compiler:latest docker/compiler/

FROM rust:1.78-slim

# ─── System dependencies ──────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    pkg-config \
    libssl-dev \
    libclang-dev \
    clang \
    make \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ─── Rust toolchain ───────────────────────────────────────────────────────────
RUN rustup component add rustfmt clippy
RUN rustup target add wasm32-unknown-unknown

# ─── Solana CLI v1.18.22 ──────────────────────────────────────────────────────
RUN sh -c "$(curl -sSfL https://release.solana.com/v1.18.22/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"

# ─── cargo-build-sbf (ships with Solana CLI, also install standalone) ─────────
RUN cargo install --git https://github.com/solana-labs/cargo-build-sbf.git \
    --tag v1.18.22 --locked \
    || true   # cargo-build-sbf is included in the Solana release; this is a fallback

# ─── Anchor CLI v0.32.0 ───────────────────────────────────────────────────────
RUN cargo install --git https://github.com/coral-xyz/anchor \
    --tag v0.32.0 \
    --locked \
    anchor-cli

# ─── Security: run as non-root user ──────────────────────────────────────────
RUN useradd -m builder
USER builder
WORKDIR /home/builder/project

# Verify toolchain is accessible as builder user
RUN solana --version && anchor --version && rustfmt --version
