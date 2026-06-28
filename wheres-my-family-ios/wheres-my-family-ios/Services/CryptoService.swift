import Foundation
import CommonCrypto

class CryptoService {
    static let shared = CryptoService()
    private let defaultFamilyKey = "WheresMyFamilySecureKey2026"
    private let saltHeader = "Salted__"

    func encryptString(_ plaintext: String, passphraseString: String? = nil) -> String {
        guard !plaintext.isEmpty else { return "" }
        let passphrase = passphraseString ?? defaultFamilyKey
        
        // 1. Generate 8-byte salt
        var salt = Data(count: 8)
        _ = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 8, $0.baseAddress!) }
        
        // 2. Derive Key and IV using EVP_BytesToKey
        let (key, iv) = evpBytesToKey(passphrase: passphrase, salt: salt, keySize: 32, ivSize: 16)
        
        // 3. Encrypt AES-256-CBC
        guard let dataToEncrypt = plaintext.data(using: .utf8) else { return "" }
        let bufferSize = dataToEncrypt.count + kCCBlockSizeAES128
        var buffer = Data(count: bufferSize)
        var numBytesEncrypted: Int = 0
        
        let status = buffer.withUnsafeMutableBytes { bufferBytes in
            dataToEncrypt.withUnsafeBytes { dataBytes in
                key.withUnsafeBytes { keyBytes in
                    iv.withUnsafeBytes { ivBytes in
                        CCCrypt(
                            CCOperation(kCCEncrypt),
                            CCAlgorithm(kCCAlgorithmAES),
                            CCOptions(kCCOptionPKCS7Padding),
                            keyBytes.baseAddress, key.count,
                            ivBytes.baseAddress,
                            dataBytes.baseAddress, dataToEncrypt.count,
                            bufferBytes.baseAddress, bufferSize,
                            &numBytesEncrypted
                        )
                    }
                }
            }
        }
        
        guard status == kCCSuccess else { return "" }
        buffer.removeSubrange(numBytesEncrypted..<buffer.count)
        
        // 4. Concat Salted__ + Salt + Ciphertext
        var payload = Data()
        payload.append(saltHeader.data(using: .ascii)!)
        payload.append(salt)
        payload.append(buffer)
        
        return payload.base64EncodedString()
    }

    func decryptString(_ ciphertext: String, passphraseString: String? = nil) -> String {
        guard !ciphertext.isEmpty else { return "" }
        let passphrase = passphraseString ?? defaultFamilyKey
        
        guard let decodedPayload = Data(base64Encoded: ciphertext) else {
            return legacyXorFallback(ciphertext, key: passphrase)
        }
        
        let headerData = saltHeader.data(using: .ascii)!
        if decodedPayload.count >= 16 && decodedPayload.prefix(8) == headerData {
            let salt = decodedPayload.subdata(in: 8..<16)
            let encryptedBytes = decodedPayload.subdata(in: 16..<decodedPayload.count)
            
            let (key, iv) = evpBytesToKey(passphrase: passphrase, salt: salt, keySize: 32, ivSize: 16)
            
            let bufferSize = encryptedBytes.count + kCCBlockSizeAES128
            var buffer = Data(count: bufferSize)
            var numBytesDecrypted: Int = 0
            
            let status = buffer.withUnsafeMutableBytes { bufferBytes in
                encryptedBytes.withUnsafeBytes { encryptedBytes in
                    key.withUnsafeBytes { keyBytes in
                        iv.withUnsafeBytes { ivBytes in
                            CCCrypt(
                                CCOperation(kCCDecrypt),
                                CCAlgorithm(kCCAlgorithmAES),
                                CCOptions(kCCOptionPKCS7Padding),
                                keyBytes.baseAddress, key.count,
                                ivBytes.baseAddress,
                                encryptedBytes.baseAddress, encryptedBytes.count,
                                bufferBytes.baseAddress, bufferSize,
                                &numBytesDecrypted
                            )
                        }
                    }
                }
            }
            
            if status == kCCSuccess {
                buffer.removeSubrange(numBytesDecrypted..<buffer.count)
                if let decryptedStr = String(data: buffer, encoding: .utf8) {
                    return decryptedStr
                }
            }
        }
        
        return legacyXorFallback(ciphertext, key: passphrase)
    }

    private func evpBytesToKey(passphrase: String, salt: Data, keySize: Int, ivSize: Int) -> (Data, Data) {
        let passwordData = passphrase.data(using: .utf8)!
        var keyAndIv = Data(count: keySize + ivSize)
        var currentOffset = 0
        var d = Data()
        
        while currentOffset < keyAndIv.count {
            var md = Data()
            if !d.isEmpty {
                md.append(d)
            }
            md.append(passwordData)
            md.append(salt)
            
            var hash = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
            md.withUnsafeBytes { mdBytes in
                _ = CC_MD5(mdBytes.baseAddress, CC_LONG(md.count), &hash)
            }
            d = Data(hash)
            
            let lengthToCopy = min(d.count, keyAndIv.count - currentOffset)
            keyAndIv.replaceSubrange(currentOffset..<(currentOffset + lengthToCopy), with: d.prefix(lengthToCopy))
            currentOffset += lengthToCopy
        }
        
        let key = keyAndIv.subdata(in: 0..<keySize)
        let iv = keyAndIv.subdata(in: keySize..<(keySize + ivSize))
        return (key, iv)
    }

    private func legacyXorFallback(_ input: String, key: String) -> String {
        let isHex = input.count % 2 == 0 && input.allSatisfy { $0.isHexDigit }
        if isHex {
            var bytes = [UInt8]()
            var index = input.startIndex
            while index < input.endIndex {
                let nextIndex = input.index(index, offsetBy: 2)
                if let byte = UInt8(input[index..<nextIndex], radix: 16) {
                    bytes.append(byte)
                }
                index = nextIndex
            }
            
            var decryptedChars = [Character]()
            let keyBytes = Array(key.utf8)
            for (i, byte) in bytes.enumerated() {
                let keyByte = keyBytes[i % keyBytes.count]
                let decryptedByte = byte ^ keyByte
                decryptedChars.append(Character(UnicodeScalar(decryptedByte)))
            }
            return String(decryptedChars)
        }
        return ""
    }
}
