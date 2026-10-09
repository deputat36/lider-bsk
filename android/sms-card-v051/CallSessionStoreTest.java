package ru.etagi.borisoglebsk.smscard;

import org.junit.Test;

import java.util.concurrent.TimeUnit;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class CallSessionStoreTest {
    @Test
    public void freshSessionIsValid() {
        long now = System.currentTimeMillis();
        CallSessionStore.Session session = new CallSessionStore.Session("79991234567", "incoming", now, false);
        assertTrue(session.isFresh(now));
    }

    @Test
    public void staleSessionIsRejected() {
        long now = System.currentTimeMillis();
        CallSessionStore.Session session = new CallSessionStore.Session(
                "79991234567",
                "incoming",
                now - TimeUnit.HOURS.toMillis(13),
                false
        );
        assertFalse(session.isFresh(now));
    }
}
