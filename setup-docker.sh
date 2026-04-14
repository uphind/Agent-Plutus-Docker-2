#!/bin/bash
set -e

# 1. Update system packages
apt-get update && apt-get upgrade -y

# 2. Install Docker (official method)
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 3. Install git (to clone the repo)
apt-get install -y git

# 4. Enable and start Docker
systemctl enable docker
systemctl start docker

# 5. Clone the repo, configure, and launch
# git clone <repo-url> /opt/tokenear
# cd /opt/tokenear
# cp .env.example .env
# nano .env  (edit with real values)
# docker compose up -d
