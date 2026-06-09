FROM debian:trixie-slim

ARG NODE_VERSION=20.19.2
ARG BUN_VERSION=1.2.11
ARG CLAUDE_VERSION=1.0.117

ENV PATH="/root/.local/bin:/root/.bun/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git jq unzip \
    ca-certificates \
    bash coreutils \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Node.js (official glibc build)
RUN curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz -o node.tar.xz && \
    tar -xJf node.tar.xz -C /usr/local --strip-components=1 && \
    rm node.tar.xz

# Bun
RUN curl -fsSL https://bun.sh/install | bash -s -- bun-v${BUN_VERSION}

# Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash -s ${CLAUDE_VERSION}

RUN mkdir -p /root/.claude && \
    echo '{}' > /root/.claude/settings.json

# Install action dependencies (separate COPY for better layer caching)
COPY package.json bun.lock /action/
RUN cd /action && bun install
COPY base-action/package.json base-action/bun.lock /action/base-action/
RUN cd /action/base-action && bun install
# Copy action source
COPY . /action/

ENTRYPOINT ["bun", "run", "/action/src/entrypoints/run.ts"]
