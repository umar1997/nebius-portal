terraform {
  required_version = ">= 1.3.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

provider "azurerm" {
  features {}
  # Terraform will use your existing `az login` session.
  # No credentials needed here if you've run `az login` already.
}

# -----------------------------------------------------------------------------
# Resource Group
# One container that holds all the resources below.
# Delete the resource group and everything inside it is gone.
# -----------------------------------------------------------------------------
resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# -----------------------------------------------------------------------------
# Virtual Network + Subnet
# The private network the VM lives on inside Azure.
# -----------------------------------------------------------------------------
resource "azurerm_virtual_network" "main" {
  name                = "${var.vm_name}-vnet"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.0.0.0/16"]
  tags                = var.tags
}

resource "azurerm_subnet" "main" {
  name                 = "${var.vm_name}-subnet"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.0.1.0/24"]
}

# -----------------------------------------------------------------------------
# Network Security Group (NSG)
# The firewall rules for the VM.
# Opens: SSH (22), HTTP (80), HTTPS (443)
# Everything else is blocked by default.
# -----------------------------------------------------------------------------
resource "azurerm_network_security_group" "main" {
  name                = "${var.vm_name}-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = var.tags

  # SSH — for you to manage the VM
  security_rule {
    name                       = "Allow-SSH"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.allowed_ssh_cidr
    destination_address_prefix = "*"
  }

  # HTTP — so the portal is reachable on port 80 (redirects to HTTPS)
  security_rule {
    name                       = "Allow-HTTP"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  # HTTPS — the actual secured portal traffic
  security_rule {
    name                       = "Allow-HTTPS"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

# -----------------------------------------------------------------------------
# Public IP Address
# The static IP that the VM is reachable on from the internet.
# Static means it won't change if the VM restarts.
# The dns_label gives you a free hostname:
#   <dns_label>.<region>.cloudapp.azure.com
# -----------------------------------------------------------------------------
resource "azurerm_public_ip" "main" {
  name                = "${var.vm_name}-pip"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  allocation_method   = "Static"
  sku                 = "Standard"

  # This gives you a free DNS name like: nebius-portal.uksouth.cloudapp.azure.com
  # You can use this with Let's Encrypt — no domain purchase needed.
  domain_name_label = var.vm_name

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Network Interface (NIC)
# Connects the VM to the subnet and the public IP.
# -----------------------------------------------------------------------------
resource "azurerm_network_interface" "main" {
  name                = "${var.vm_name}-nic"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  tags                = var.tags

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.main.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.main.id
  }
}

# -----------------------------------------------------------------------------
# Associate the NSG with the Network Interface
# This attaches the firewall rules to the VM's network card.
# -----------------------------------------------------------------------------
resource "azurerm_network_interface_security_group_association" "main" {
  network_interface_id      = azurerm_network_interface.main.id
  network_security_group_id = azurerm_network_security_group.main.id
}

# -----------------------------------------------------------------------------
# OS Disk
# A managed disk is created automatically with the VM below.
# It uses Standard SSD which is reliable and cheap for this workload.
# No separate disk resource is needed — the VM block handles it.
# -----------------------------------------------------------------------------

# -----------------------------------------------------------------------------
# The Virtual Machine
# Ubuntu 22.04 LTS — stable, well-supported, everything in the README uses it.
# SSH key auth only — no passwords.
# -----------------------------------------------------------------------------
resource "azurerm_linux_virtual_machine" "main" {
  name                = var.vm_name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  size                = var.vm_size
  admin_username      = var.admin_username
  tags                = var.tags

  # Attach the NIC we created above
  network_interface_ids = [azurerm_network_interface.main.id]

  # SSH key — no password login
  admin_ssh_key {
    username   = var.admin_username
    public_key = file(var.ssh_public_key_path)
  }

  # OS disk — Standard SSD, 30GB is plenty for nginx + the portal
  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
    disk_size_gb         = var.os_disk_size_gb
  }

  # Ubuntu 22.04 LTS (the "latest" patch is pulled automatically)
  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  # This script runs once when the VM first boots.
  # It installs nginx so the VM is ready to configure without you SSHing in first.
  custom_data = base64encode(<<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y nginx certbot python3-certbot-nginx
    systemctl enable nginx
    systemctl start nginx
  EOF
  )
}
