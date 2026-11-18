declare const nacl: {
  sign: {
    detached(message: Uint8Array, secretKey: Uint8Array): Uint8Array
    keyPair: {
      fromSeed(seed: Uint8Array): {
        publicKey: Uint8Array
        secretKey: Uint8Array
      }
    }
  }
}

export = nacl
