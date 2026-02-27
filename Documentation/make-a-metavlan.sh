
docker network create -d macvlan    --subnet=192.168.73.0/24 --gateway=192.168.73.1     -o parent=eno1         metavlan

# You only need to create this metavlan once... 
# subnet: your host network (like 192.168.73.0) with it's subnet: /24
# gateway: your normal gateway in your network (most of the time your router)
# parent=eno1: the network interface of your host which is connected to the network (you can find it with ifconfig or ip addr)