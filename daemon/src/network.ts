import { networkInterfaces } from "node:os";
import { config } from "./config.js";

const VIRTUAL_IFACE_RE = /^(docker|br-|veth|virbr|vmnet|vboxnet|utun|tun|tap|wg|zt|ppp|lo)/i;

const PRIORITY_PREFIXES = ["192.168.", "10.", "172."];

function isLinkLocal(ip: string): boolean {
  return ip.startsWith("169.254.");
}

function priorityOf(ip: string): number {
  const idx = PRIORITY_PREFIXES.findIndex((p) => ip.startsWith(p));
  return idx === -1 ? PRIORITY_PREFIXES.length : idx;
}

export function detectLanIp(): string {
  if (config.bindIpOverride) return config.bindIpOverride;

  const candidates: { ip: string; priority: number }[] = [];

  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (!addrs) continue;
    if (VIRTUAL_IFACE_RE.test(name)) continue;

    for (const addr of addrs) {
      if (addr.family !== "IPv4") continue;
      if (addr.internal) continue;
      if (isLinkLocal(addr.address)) continue;

      candidates.push({ ip: addr.address, priority: priorityOf(addr.address) });
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      "Nenhuma interface de LAN encontrada. Defina QRDROP_BIND_IP com o IP correto.",
    );
  }

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]!.ip;
}
