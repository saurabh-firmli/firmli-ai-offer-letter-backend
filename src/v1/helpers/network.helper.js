import dns from "node:dns/promises";
import net from "node:net";

// Addresses inside our own network or otherwise not on the public internet (loopback, private, link-local
// such as the cloud metadata service 169.254.169.254, carrier-grade NAT, multicast, reserved)
const INTERNAL = new net.BlockList();
for (const [address, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
    ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
]) {
    INTERNAL.addSubnet(address, prefix, "ipv4");
}
// An IPv4-mapped IPv6 address (::ffff:127.0.0.1) is checked against the IPv4 ranges above by BlockList itself
for (const [address, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]]) {
    INTERNAL.addSubnet(address, prefix, "ipv6");
}

/**
 * Checks for servers a client names in Settings (their SMTP host), so the API never connects into our own
 * network for them. The name is resolved, because a public-looking name (127.0.0.1.nip.io, or a domain the
 * client controls) can point at an internal address.
 */
const networkHelper = {
    isInternal: (address) => INTERNAL.check(address, net.isIPv6(address) ? "ipv6" : "ipv4"),

    /**
     * The host's public address to connect to; null when it is (or resolves to) an internal address.
     * Throws when the name does not resolve. Connect to the answer, not the name, so DNS cannot change in between.
     */
    publicAddressOf: async (host) => {
        const addresses = net.isIP(host) ? [{address: host}] : await dns.lookup(host, {all: true});
        if (!addresses.length || addresses.some(({address}) => networkHelper.isInternal(address))) return null;
        return addresses[0].address;
    },
};

export default networkHelper;
