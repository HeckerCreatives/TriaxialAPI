const fs = require('fs');
const forge = require('node-forge');

// Generate an RSA key pair
const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);

// Save private key to a file
fs.writeFileSync('private-key.pem', privateKeyPem);
console.log('Private key saved to private-key.pem');

// Save public key to a file
fs.writeFileSync('public-key.pem', publicKeyPem);
console.log('Public key saved to public-key.pem');