# Terraform — Azure VM for nebius-portal

Runs once to create everything the portal needs on Azure:
VNet, Subnet, NSG, Public IP, NIC, and the VM itself.

## What you need first

- [Terraform installed](https://developer.hashicorp.com/terraform/install)

```shell
# MacOS
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

```shell
wget -O - https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /home/msalman/code-space/terraform/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/home/msalman/code-space/terraform/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
apt update && apt install terraform
```

- Azure CLI installed and logged in: `az login`
- An SSH key pair on your machine (if you don't have one: `ssh-keygen -t rsa -b 4096`)

## How to run it

```bash
cd terraform

# 1. Download the Azure provider
terraform init

# 2. See exactly what it will create (nothing is built yet)
terraform plan

# 3. Build everything — type "yes" when prompted
terraform apply
```

When it finishes, it prints:
- The VM's public IP address
- The free DNS hostname (use this for HTTPS)
- A ready-to-run SSH command

## Customise before running (optional)

Edit `variables.tf` to change:

| Variable | Default | Change it if... |
|----------|---------|-----------------|
| `location` | `uksouth` | You want a different Azure region (e.g. `uaenorth` for UAE) |
| `vm_size` | `Standard_B2s` | You want smaller (`Standard_B1s`, ~£8/mo) or larger |
| `ssh_public_key_path` | `~/.ssh/id_rsa.pub` | Your key is in a different location |
| `allowed_ssh_cidr` | `*` (anywhere) | You want to restrict SSH to your office IP only (recommended) |

## To tear everything down

```bash
terraform destroy
```

This deletes the VM, IP, NIC, NSG, subnet, and VNet — everything in one command.

## Why no API Management Service?

API Management is an Azure service for exposing and managing APIs for external
developers — think rate limiting, API keys, developer portals. It starts at
~£130/month and is not needed here. nginx on the VM does everything this portal
requires (reverse proxy, routing, WebSocket forwarding) for free. API Management
would add cost and complexity with no benefit for an internal tool.
