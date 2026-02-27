declare module "qrcode-terminal" {
  function generate(text: string, opts?: { small?: boolean }, cb?: (qr: string) => void): void;
  export = { generate };
}

declare module "bs58" {
  function encode(data: Uint8Array | Buffer): string;
  function decode(data: string): Uint8Array;
  const _default: { encode: typeof encode; decode: typeof decode };
  export default _default;
}
