const prefix = new Uint8Array([
  0,
  0,
  0,
  11,
  ...new TextEncoder().encode("ssh-ed25519"),
  0,
  0,
  0,
  32,
]);
const bytes = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const hash = async (value: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", value));
export async function inspectMusePublicKey(text: string) {
  const parts = text.trim().split(/\s+/);
  if (parts[0] !== "ssh-ed25519" || !parts[1] || text.length > 2000)
    throw new Error("Paste the ssh-ed25519 public key.");
  const wire = bytes(parts[1]);
  if (
    wire.length !== prefix.length + 32 ||
    !prefix.every((b, i) => wire[i] === b)
  )
    throw new Error("Invalid Ed25519 public key.");
  return {
    fingerprint: "SHA256:" + base64(await hash(wire)).replace(/=+$/, ""),
    wire,
  };
}
export type MuseBrowserKey = { key: CryptoKey; fingerprint: string };
export async function connectMuseKey(text: string): Promise<MuseBrowserKey> {
  // Only local memory: no upload, storage, logging or export of the private key.
  if (!text.startsWith("-----BEGIN OPENSSH PRIVATE KEY-----"))
    throw new Error("Choose Muse's OpenSSH private-key file on this computer.");
  const data = bytes(text.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
  const magic = new TextEncoder().encode("openssh-key-v1\0");
  if (!magic.every((b, i) => data[i] === b))
    throw new Error("Invalid OpenSSH key file.");
  let offset = magic.length;
  const number = () => {
    if (offset + 4 > data.length) throw new Error("Truncated key file.");
    const n = new DataView(data.buffer).getUint32(offset);
    offset += 4;
    return n;
  };
  const field = () => {
    const n = number();
    if (n > data.length - offset) throw new Error("Truncated key file.");
    const result = data.slice(offset, offset + n);
    offset += n;
    return result;
  };
  const decode = (value: Uint8Array) => new TextDecoder().decode(value);
  if (
    decode(field()) !== "none" ||
    decode(field()) !== "none" ||
    field().length !== 0 ||
    number() !== 1
  )
    throw new Error(
      "Use Muse's single unattended key; encrypted key files are not supported here.",
    );
  const wire = field();
  const privateData = field();
  if (offset !== data.length) throw new Error("Unexpected key-file data.");
  const inspected = await inspectMusePublicKey("ssh-ed25519 " + base64(wire));
  let pos = 0;
  const num = () => {
    if (pos + 4 > privateData.length) throw new Error("Truncated private key.");
    const n = new DataView(privateData.buffer).getUint32(pos);
    pos += 4;
    return n;
  };
  const item = () => {
    const n = num();
    if (n > privateData.length - pos) throw new Error("Truncated private key.");
    const v = privateData.slice(pos, pos + n);
    pos += n;
    return v;
  };
  if (num() !== num() || decode(item()) !== "ssh-ed25519")
    throw new Error("Invalid Ed25519 private key.");
  const publicBytes = item();
  const secret = item();
  item();
  if (
    publicBytes.length !== 32 ||
    secret.length !== 64 ||
    !publicBytes.every(
      (b, i) => b === wire[prefix.length + i] && b === secret[32 + i],
    )
  )
    throw new Error("Public and private key do not match.");
  const pkcs8 = new Uint8Array([
    0x30,
    0x2e,
    2,
    1,
    0,
    0x30,
    5,
    6,
    3,
    0x2b,
    0x65,
    0x70,
    4,
    0x22,
    4,
    0x20,
    ...secret.slice(0, 32),
  ]);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const verifier = await crypto.subtle.importKey(
    "raw",
    publicBytes,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const signature = await crypto.subtle.sign("Ed25519", key, challenge);
  if (!(await crypto.subtle.verify("Ed25519", verifier, signature, challenge)))
    throw new Error("Public and private key do not match.");
  secret.fill(0);
  pkcs8.fill(0);
  privateData.fill(0);
  data.fill(0);
  return { key, fingerprint: inspected.fingerprint };
}
export async function museWrite(
  key: MuseBrowserKey,
  action: string,
  input: Record<string, unknown>,
) {
  if (
    ![
      "workflow/claim",
      "verdict",
      "defect",
      "test-data/prepare",
      "retest-request",
    ].includes(action)
  )
    throw new Error("Unsupported QA action.");
  const urlSafe = (value: Uint8Array) =>
    base64(value).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = JSON.stringify(input);
  const path = "/qa/api/" + action;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = urlSafe(crypto.getRandomValues(new Uint8Array(24)));
  const digest = [...(await hash(new TextEncoder().encode(body)))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const canonical = new TextEncoder().encode(
    ["POST", path, timestamp, nonce, digest].join("\n"),
  );
  const signature = urlSafe(
    new Uint8Array(await crypto.subtle.sign("Ed25519", key.key, canonical)),
  );
  const response = await fetch(path, {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      "X-Muse-Key-Fingerprint": key.fingerprint,
      "X-Muse-Timestamp": timestamp,
      "X-Muse-Nonce": nonce,
      "X-Muse-Signature": signature,
    },
    body,
  });
  const receipt = await response.json();
  if (!response.ok) throw new Error(receipt.error || "QA write failed.");
  return receipt;
}
