package ru.etagi.borisoglebsk.smscard;

import org.junit.Test;
import static org.junit.Assert.*;

/** Regression: storage keys 7..., SMS recipients +7..., same phone in all paths. */
public class SmsRecipientFormatTest {
    @Test public void russianPlusSevenIsRetainedForSms() {
        assertEquals("+79991234567", PhoneNormalizer.toSmsRecipient("+7 (999) 123-45-67"));
    }
    @Test public void russianEightBecomesPlusSeven() {
        assertEquals("+79991234567", PhoneNormalizer.toSmsRecipient("8 999 123 45 67"));
    }
    @Test public void russianTenDigitMobileBecomesPlusSeven() {
        assertEquals("+79991234567", PhoneNormalizer.toSmsRecipient("9991234567"));
    }
    @Test public void oldStoredCanonicalSevenBecomesPlusSeven() {
        assertEquals("+79991234567", PhoneNormalizer.toSmsRecipient("79991234567"));
        assertEquals("79991234567", PhoneNormalizer.normalize("79991234567"));
    }
    @Test public void internationalRecipientRetainsPlusPrefix() {
        assertEquals("+447700900123", PhoneNormalizer.toSmsRecipient("+44 7700 900123"));
        assertEquals("+12025550123", PhoneNormalizer.toSmsRecipient("+1 (202) 555-0123"));
    }
    @Test public void ambiguousOrEmptyNumbersAreRejected() {
        assertEquals("", PhoneNormalizer.toSmsRecipient(""));
        assertEquals("", PhoneNormalizer.toSmsRecipient("12345"));
        assertEquals("", PhoneNormalizer.toSmsRecipient("447700900123"));
    }
    @Test public void smsRecipientContainsOnlyPlusAndDigits() {
        String address = PhoneNormalizer.toSmsRecipient("8 (999) 123-45-67");
        assertTrue(address.matches("\\+[0-9]+"));
    }
}
