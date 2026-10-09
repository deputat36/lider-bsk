package ru.etagi.borisoglebsk.smscard;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class PhoneNormalizerTest {
    @Test
    public void russianFormatsNormalizeToSameNumber() {
        assertEquals("79991234567", PhoneNormalizer.normalize("+7 (999) 123-45-67"));
        assertEquals("79991234567", PhoneNormalizer.normalize("8 999 123 45 67"));
        assertEquals("79991234567", PhoneNormalizer.normalize("9991234567"));
    }

    @Test
    public void extensionIsNotMergedIntoPhone() {
        assertEquals("79991234567", PhoneNormalizer.normalize("+7 999 123-45-67,123"));
        assertEquals("79991234567", PhoneNormalizer.normalize("+7 999 123-45-67;123"));
    }

    @Test
    public void russianMobileDetectionWorks() {
        assertTrue(PhoneNormalizer.looksLikeRussianMobile("+7 999 123-45-67"));
        assertFalse(PhoneNormalizer.looksLikeRussianMobile("+7 473 123-45-67"));
    }
}
