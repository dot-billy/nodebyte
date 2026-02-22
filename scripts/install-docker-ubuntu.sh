#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  echo "Please run as a normal user (this script uses sudo as needed)."
  exit 1
fi

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
else
  echo "Cannot detect OS (/etc/os-release missing)."
  exit 1
fi

if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This script targets Ubuntu. Detected ID='${ID:-unknown}'."
  exit 1
fi

echo "Installing Docker Engine from official Docker apt repo (Ubuntu: ${VERSION_CODENAME:-unknown})."

# In non-interactive environments, sudo can't prompt for a password.
# Fail fast with a clear instruction.
if ! sudo -n true 2>/dev/null; then
  echo "sudo needs a password, but this shell is non-interactive."
  echo "Run this script from an interactive terminal so sudo can prompt:"
  echo "  ./scripts/install-docker-ubuntu.sh"
  exit 2
fi

echo "Removing conflicting packages (if present)."
# From Docker docs: https://docs.docker.com/engine/install/ubuntu/#uninstall-old-versions
sudo apt remove -y $(dpkg --get-selections docker.io docker-compose docker-compose-v2 docker-doc podman-docker containerd runc 2>/dev/null | cut -f1) || true

echo "Setting up Docker apt repo + keyring."
sudo apt update -y
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update -y

echo "Installing Docker packages."
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "Ensuring Docker service is running."
sudo systemctl enable --now docker || true

echo "Adding current user to 'docker' group (so sudo isn't needed)."
sudo groupadd docker 2>/dev/null || true
sudo usermod -aG docker "$USER"

echo "Attempting to activate group membership in this shell."
echo "If the next step still says 'permission denied', log out and log back in."
newgrp docker <<'EOS'
set -euo pipefail
docker version
docker run --rm hello-world
EOS

echo "Done."
echo "You should now be able to run: docker ps"

