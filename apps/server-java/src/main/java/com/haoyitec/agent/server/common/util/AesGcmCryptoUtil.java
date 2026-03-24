package com.haoyitec.agent.server.common.util;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

public final class AesGcmCryptoUtil {

    private static final String AES_GCM_NO_PADDING = "AES/GCM/NoPadding";
    private static final int IV_SIZE = 12;
    private static final int GCM_TAG_BITS = 128;

    private AesGcmCryptoUtil() {
    }

    public static String encrypt(String plaintext, String secretKey) {
        try {
            byte[] key = deriveKey(secretKey);
            byte[] iv = new byte[IV_SIZE];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance(AES_GCM_NO_PADDING);
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            byte[] payload = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
            return Base64.getEncoder().encodeToString(payload);
        } catch (Exception ex) {
            throw new IllegalStateException("密钥加密失败: " + ex.getMessage(), ex);
        }
    }

    public static String decrypt(String ciphertext, String secretKey) {
        try {
            byte[] payload = Base64.getDecoder().decode(ciphertext);
            if (payload.length <= IV_SIZE) {
                throw new IllegalStateException("密文格式非法");
            }

            byte[] iv = new byte[IV_SIZE];
            byte[] encrypted = new byte[payload.length - IV_SIZE];
            System.arraycopy(payload, 0, iv, 0, IV_SIZE);
            System.arraycopy(payload, IV_SIZE, encrypted, 0, encrypted.length);

            Cipher cipher = Cipher.getInstance(AES_GCM_NO_PADDING);
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(deriveKey(secretKey), "AES"), new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] plaintext = cipher.doFinal(encrypted);
            return new String(plaintext, StandardCharsets.UTF_8);
        } catch (Exception ex) {
            throw new IllegalStateException("密钥解密失败: " + ex.getMessage(), ex);
        }
    }

    private static byte[] deriveKey(String secretKey) throws Exception {
        String source = secretKey == null ? "" : secretKey;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return digest.digest(source.getBytes(StandardCharsets.UTF_8));
    }
}
