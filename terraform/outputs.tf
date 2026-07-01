# These values are printed in your terminal after `terraform apply` finishes.
# Copy them — you'll need them to configure the VM.

output "public_ip_address" {
  description = "The public IP address of the VM — use this to SSH in"
  value       = azurerm_public_ip.main.ip_address
}

output "dns_name" {
  description = "The free Azure DNS hostname — use this for HTTPS with Let's Encrypt"
  value       = azurerm_public_ip.main.fqdn
}

output "ssh_command" {
  description = "Ready-to-run SSH command to connect to the VM"
  value       = "ssh ${var.admin_username}@${azurerm_public_ip.main.ip_address}"
}

output "resource_group_name" {
  description = "Resource group name — needed for az CLI commands"
  value       = azurerm_resource_group.main.name
}

output "vm_name" {
  description = "VM name"
  value       = azurerm_linux_virtual_machine.main.name
}
