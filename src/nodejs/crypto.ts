import crypto from "crypto";
import fs from "fs";
import { ADMIN_PASS } from "./config";

////////////////////////////////////////////////////////////////////////

export type CryptoConfig = {
  algrorithm?: string;
  ivLength?: number;
  secretKeyLength?: number;
  secret?: string;
  blobEncoding?: crypto.Encoding;
};

export const DEFAULT_ALGORITHM = "aes-256-cbc";
export const DEFAULT_IV_LENGTH = 16;
export const DEFAULT_SECRET_KEY_LENGTH = 32;

export const DEFAULT_SECRET =
  process.env.PYTHONIDEASALT_GITHUB_TOKEN_FULL ||
  process.env.ADMIN_PASS ||
  "keyboardcat";

export const DEFAULT_BLOB_ENCODING = "base64";

export const DEFAULT_CRYPTO_CONFIG: CryptoConfig = {
  algrorithm: DEFAULT_ALGORITHM,
  ivLength: DEFAULT_IV_LENGTH,
  secretKeyLength: DEFAULT_SECRET_KEY_LENGTH,
  secret: DEFAULT_SECRET,
  blobEncoding: DEFAULT_BLOB_ENCODING,
};

export class Crypto {
  config: CryptoConfig = DEFAULT_CRYPTO_CONFIG;

  constructor(configOpt?: CryptoConfig) {
    const config = configOpt || DEFAULT_CRYPTO_CONFIG;
    this.config = { ...DEFAULT_CRYPTO_CONFIG, ...config };
  }

  get secretKey() {
    const secretKey = Buffer.alloc(
      this.config.secretKeyLength || DEFAULT_SECRET_KEY_LENGTH
    );

    Buffer.from(this.config.secret || DEFAULT_SECRET, "utf8").copy(secretKey);

    return secretKey;
  }

  // if inputEncoding is missing, the input should be a Buffer
  encrypt(content: any, inputEncoding?: any) {
    const outputEncoding = this.config.blobEncoding;
    const iv = crypto.randomBytes(this.config.ivLength || DEFAULT_IV_LENGTH);

    const cipher = crypto.createCipheriv(
      this.config.algrorithm || DEFAULT_ALGORITHM,
      this.secretKey,
      iv
    );

    // https://nodejs.org/api/crypto.html#cipherupdatedata-inputencoding-outputencoding
    const encrypted =
      cipher.update(
        content,
        inputEncoding as crypto.Encoding,
        outputEncoding as crypto.Encoding
      ) + cipher.final(outputEncoding as crypto.Encoding);

    const ivEncB64 =
      iv.toString(outputEncoding as crypto.Encoding) + " " + encrypted;

    return ivEncB64;
  }

  // if outputEncoding is missing, a Buffer will be returned
  decrypt(content: any, outputEncoding?: crypto.Encoding) {
    const inputEncoding = this.config.blobEncoding as crypto.Encoding;

    const [ivB64, encB64] = content.split(" ");

    const iv = Buffer.from(ivB64, inputEncoding);

    const decipher = crypto.createDecipheriv(
      this.config.algrorithm || DEFAULT_ALGORITHM,
      this.secretKey,
      iv
    );

    // https://nodejs.org/api/crypto.html#decipherupdatedata-inputencoding-outputencoding
    const decrypted =
      decipher.update(
        encB64,
        inputEncoding,
        outputEncoding as crypto.Encoding
      ) + decipher.final();

    return decrypted;
  }
}

////////////////////////////////////////////////////////////////////////

export const CRYPTENV_PATH = "cryptenv";

export function storeCryptEnv(cryptenv: any) {
  const cr = new Crypto({ secret: ADMIN_PASS });

  const enc = cr.encrypt(JSON.stringify(cryptenv));

  fs.writeFileSync(CRYPTENV_PATH, enc);
}

export function getCryptEnv(def?: any) {
  const cr = new Crypto({ secret: ADMIN_PASS });

  try {
    const enc = fs.readFileSync(CRYPTENV_PATH).toString();

    const dec = JSON.parse(cr.decrypt(enc));

    return dec;
  } catch (err) {
    return def || {};
  }
}

export const CRYPTENV = getCryptEnv();
