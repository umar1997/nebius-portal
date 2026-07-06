# Setup

1. Install Terraform
```shell
# https://developer.hashicorp.com/terraform/install

wget -O - https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(grep -oP '(?<=UBUNTU_CODENAME=).*' /etc/os-release || lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```
2. Run `$terraform init`
3. Run `$terraform plan -out=tfplan`
4. Run `terraform apply "tfplan"`
5. You will get an output like this
```shell
Apply complete! Resources: 7 added, 0 changed, 0 destroyed.

Outputs:

dns_name = "nebius-portal-vm.uaenorth.cloudapp.azure.com"
public_ip_address = "74.243.253.208"
resource_group_name = "rg-nebius"
ssh_command = "ssh azureuser@74.243.253.208"
vm_name = "nebius-portal-vm"
```

6. Check connection to Nebius
```shell
nc -zv 89.169.98.29 22
Connection to 89.169.98.29 22 port [tcp/ssh] succeeded!
```

7. Check if you can connect to the Azure VM `ssh -i ~/.ssh/dev/id_rsa azureuser@74.243.253.208`
```shell
Host azure-nebius-portal-vm
    HostName 74.243.253.208
    User azureuser
    IdentityFile ~/.ssh/dev/id_rsa
```
8. On your laptop first — copy your Nebius private key to the VM
```shell
scp ~/.ssh/dev/id_rsa azure-nebius-portal-vm:~/.ssh/nebius_id_rsa
```

9. Run on the VM
```shell
chmod 600 ~/.ssh/nebius_id_rsa
vim ~/.ssh/config

# Paste
Host nebius-networking
    HostName 89.169.98.29
    User networking
    IdentityFile ~/.ssh/nebius_id_rsa

chmod 600 ~/.ssh/config

#(LOOK AT SECTION: Paste into `vim ~/.ssh/config`)
```

10. Architecture
```shell
Browser → Azure VM nginx
              ├── /                  → React portal (served locally)
              ├── /app/react-demo/   → localhost:8001 (tunnel → worker-0:8001)
              └── /app/gradio-demo/  → localhost:8888 (tunnel → worker-0:8888)
```

11. Install autossh on VM `sudo apt install -y autossh`
12. Run autossh command
```ssh
autossh -M 0 -f -N \
  -L 8001:worker-0:8001 \
  -L 8888:worker-0:8888 \
  nebius-networking


~$ nc -zv localhost 8001
Connection to localhost (127.0.0.1) 8001 port [tcp/*] succeeded!
~$ nc -zv localhost 8888
Connection to localhost (127.0.0.1) 8888 port [tcp/*] succeeded!
```

13. Setup Systemd `sudo vim /etc/systemd/system/nebius-tunnel.service`
```shell
# cat /etc/systemd/system/nebius-tunnel.service

[Unit]
Description=SSH SOCKS5 tunnel to Nebius
After=network.target

[Service]
User=azureuser
ExecStart=/usr/bin/autossh -M 0 -N -D 1080 -F /home/azureuser/.ssh/config -o ServerAliveInterval=30 -o ServerAliveCountMax=3 nebius-networking
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

14. Start the service
```shell
```shell
sudo systemctl daemon-reload
sudo systemctl enable nebius-tunnel # [ONLY WHEN SETTING UP THE FIRST TIME]
sudo systemctl start nebius-tunnel

# Confirm it's running cleanly
sudo systemctl status nebius-tunnel
```

15. Check if working correctly
```shell
curl --socks5 localhost:1080 http://worker-0:8001 # (If worker-0 alias in ~/.ssh/config o.w get IP ssh nebius-networking "getent hosts worker-0")
curl --socks5 localhost:1080 http://10.62.40.79:8001
# IF; curl: (7) Failed to connect to localhost port 1080 after 0 ms: Connection refused
sudo systemctl stop nebius-tunnel
sleep 2
ps aux | grep autossh
sudo pkill -9 autossh
sudo systemctl start nebius-tunnel
sudo systemctl status nebius-tunnel
```

16. Retry
```shell
curl --socks5 localhost:1080 http://worker-0:8001
curl --socks5 localhost:1080 http://10.62.40.79:8001
for i in {0..7}; do ssh nebius-networking "getent hosts worker-$i"; done

10.62.40.79     worker-0.soperator-nodeset-svc.soperator.svc.cluster.local
10.62.8.22      worker-1.soperator-nodeset-svc.soperator.svc.cluster.local
10.62.12.71     worker-2.soperator-nodeset-svc.soperator.svc.cluster.local
10.62.134.28    worker-3.soperator-nodeset-svc.soperator.svc.cluster.local
10.62.5.94      worker-4.soperator-nodeset-svc.soperator.svc.cluster.local
10.62.115.41    worker-5.soperator-nodeset-svc.soperator.svc.cluster.local
10.62.26.144    worker-6.soperator-nodeset-svc.soperator.svc.cluster.local
10.62.116.171   worker-7.soperator-nodeset-svc.soperator.svc.cluster.local
```

17. Paste into `vim ~/.ssh/config`
```shell
Host nebius-networking
    HostName 89.169.98.29
    User networking
    IdentityFile ~/.ssh/nebius_id_rsa

Host worker-0
    HostName 10.62.40.79

Host worker-1
    HostName 10.62.8.22

Host worker-2
    HostName 10.62.12.71

Host worker-3
    HostName 10.62.134.28

Host worker-4
    HostName 10.62.5.94

Host worker-5
    HostName 10.62.115.41

Host worker-6
    HostName 10.62.26.144

Host worker-7
    HostName 10.62.116.171
```


15. Kill the autossh process
```shell
# Good. Now kill the autossh process you started manually — systemd is running it now and you'll end up with two competing tunnels fighting over the same ports.
# bash# Find and kill the manually started autossh
# pkill autossh

# # Confirm systemd's version restarted cleanly
# sudo systemctl status nebius-tunnel

# # Confirm the ports are still up (systemd's tunnel, not yours)
# nc -zv localhost 8001
# nc -zv localhost 8888

azureuser@nebius-portal-vm:~$ pkill autossh
azureuser@nebius-portal-vm:~$ sudo systemctl status nebius-tunnel
● nebius-tunnel.service - SSH tunnels to Nebius worker nodes
     Loaded: loaded (/etc/systemd/system/nebius-tunnel.service; enabled; vendor preset: enabled)
     Active: activating (auto-restart) (Result: exit-code) since Fri 2026-07-03 12:01:17 UTC; 6s ago
    Process: 25155 ExecStart=/usr/bin/autossh -M 0 -N -F /home/azureuser/.ssh/config -L 8001:worker-0:8001 -L 8888:worker-0:8888 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 nebius-networking (code=exited, status=1/FAILURE)
   Main PID: 25155 (code=exited, status=1/FAILURE)
        CPU: 38ms
azureuser@nebius-portal-vm:~$ nc -zv localhost 8001
Connection to localhost (127.0.0.1) 8001 port [tcp/*] succeeded!
azureuser@nebius-portal-vm:~$ nc -zv localhost 8888
Connection to localhost (127.0.0.1) 8888 port [tcp/*] succeeded!
```

