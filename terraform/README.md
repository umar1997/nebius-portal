# Terraform — Azure VM for nebius-portal

Runs once to create everything the portal needs on Azure:
VNet, Subnet, NSG, Public IP, NIC, and the VM itself.

---

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
- Your Azure Subscription ID — run `az account show --query id -o tsv` to get it

---

## How to run it

```bash
cd terraform

# 1. Copy the example values file and fill it in
cp terraform.tfvars.example terraform.tfvars
# Open terraform.tfvars — fill in your subscription_id at minimum.

# 2. Download the Azure provider
terraform init

# 3. See exactly what it will create (nothing is built yet)
terraform plan OR terraform plan -out=tfplan

# 4. Build everything — type "yes" when prompted
terraform apply OR terraform apply "tfplan"
```

When it finishes, it prints:
- The VM's public IP address
- The free DNS hostname (use this for HTTPS with Let's Encrypt)
- A ready-to-run SSH command

---

## The one value you must fill in

Open `terraform.tfvars` and set your `subscription_id`:

```bash
# Run this to find your subscription ID
az account show --query id -o tsv

# If you have multiple subscriptions, list them all
az account list --query "[].{Name:name, ID:id, Active:isDefault}" -o table
# Then set the right one active:
az account set --subscription "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Without a subscription_id in the config, Terraform silently uses whichever
subscription happens to be active — wrong subscription, resources in the wrong place.

---

## Using an existing resource group

If you already have a resource group you want to put the VM in:

```hcl
# in terraform.tfvars
create_resource_group = false
resource_group_name   = "your-existing-rg-name"
```

If you want a fresh resource group (default):

```hcl
create_resource_group = true
resource_group_name   = "nebius-portal-rg"
```

---

## To tear everything down

```bash
terraform destroy
```

This deletes the VM, IP, NIC, NSG, subnet, VNet, and resource group (if Terraform
created it) — everything in one command. If you used an existing resource group,
only the resources inside it are deleted, not the group itself.

---

## Why no API Management Service?

API Management is an Azure product for exposing APIs to external developers —
rate limiting, API keys, developer portals. It starts at ~£130/month and does
nothing useful for an internal tool. nginx on the VM handles reverse proxying,
routing, and WebSocket forwarding for free.
