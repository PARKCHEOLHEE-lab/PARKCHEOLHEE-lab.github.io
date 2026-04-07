FROM ruby:3.2-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    git-lfs \
    curl \
    gh \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

# Install Node.js and Claude Code
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g @anthropic-ai/claude-code @openai/codex && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
