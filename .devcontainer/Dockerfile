FROM ruby:3.2-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    git-lfs \
    curl \
    gh \
    jq \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

RUN python3 -m venv /opt/latentspace-venv \
    && /opt/latentspace-venv/bin/python -m pip install --no-cache-dir \
    openai \
    beautifulsoup4 \
    lxml \
    numpy \
    scikit-learn \
    pytest \
    tiktoken

ENV LATENTSPACE_PYTHON=/opt/latentspace-venv/bin/python

# Install Node.js and Claude Code
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g @anthropic-ai/claude-code @openai/codex && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
