package ru.etagi.borisoglebsk.smscard;

import org.junit.Test;
import static org.junit.Assert.*;

public class BugfixSafetyTest {
    @Test public void internationalNumberMustKeepCountryPrefix() {
        assertEquals("+447700900123", PhoneNormalizer.normalize("+44 7700 900123"));
        assertEquals("+12025550123", PhoneNormalizer.normalize("+1 (202) 555-0123"));
    }
    @Test public void ambiguousForeignNumberMustNotBeAssumedRussian() {
        assertEquals("", PhoneNormalizer.normalize("447700900123"));
        assertFalse(PhoneNormalizer.usable("447700900123"));
        assertFalse(PhoneNormalizer.usable("1234567890"));
    }
    @Test public void russianNumbersRemainCompatibleWithExistingHistory() {
        assertEquals("79991234567", PhoneNormalizer.normalize("8 (999) 123-45-67"));
        assertEquals("79991234567", PhoneNormalizer.normalize("+7 999 123 45 67"));
        assertEquals("79991234567", PhoneNormalizer.normalize("999 123 45 67"));
    }
    @Test public void detectUnknownTemplateVariables() {
        assertTrue(SmsTemplates.containsUnknownVariables("Здравствуйте {client_phone}"));
        assertFalse(SmsTemplates.containsUnknownVariables("Добрый день"));
        assertFalse(SmsTemplates.containsUnknownVariables("{agent_name}, {phone}"));
    }
}
