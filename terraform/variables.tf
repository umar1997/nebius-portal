variable "subscription_id" {
  description = "Your Azure Subscription ID. Find it by running: az account show --query id -o tsv"
  type        = string
  # No default — you must fill this in. Prevents Terraform from silently
  # deploying into the wrong subscription if you have more than one.
}

variable "create_resource_group" {
  description = "Set to true to create a new resource group. Set to false to use an existing one."
  type        = bool
  default     = true
}

variable "resource_group_name" {
  description = "Name of the Azure resource group. Created fresh if create_resource_group = true. Must already exist if create_resource_group = false."
  type        = string
  default     = "nebius-portal-rg"
}

variable "location" {
  description = "Azure region to deploy into"
  type        = string
  default     = "uksouth"
  # Other options: "eastus", "westeurope", "uaenorth" (UAE North, closest to Abu Dhabi)
}

variable "vm_name" {
  description = "Name of the virtual machine"
  type        = string
  default     = "nebius-portal-vm"
}

variable "vm_size" {
  description = "Azure VM size"
  type        = string
  default     = "Standard_B2s"
  # Standard_B2s = 2 vCPUs, 4GB RAM, ~£30/month
  # Standard_B1s = 1 vCPU,  1GB RAM, ~£8/month  (fine if traffic is low)
}

variable "admin_username" {
  description = "SSH username for the VM"
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key_path" {
  description = "Path to your SSH public key file on your local machine"
  type        = string
  default     = "~/.ssh/id_rsa.pub"
  # Change this to wherever your public key lives, e.g. "~/.ssh/nebius_portal.pub"
}

variable "os_disk_size_gb" {
  description = "Size of the OS disk in GB"
  type        = number
  default     = 30
}

variable "allowed_ssh_cidr" {
  description = "IP address (or range) allowed to SSH into the VM. Defaults to anywhere — restrict this to your office IP for better security."
  type        = string
  default     = "*"
  # Example to restrict: "203.0.113.0/24"
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    project     = "nebius-portal"
    environment = "production"
    managed_by  = "terraform"
  }
}
