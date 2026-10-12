package ru.etagi.borisoglebsk.smscard;

import org.junit.Test;
import static org.junit.Assert.*;

/** Pure state model regression tests, no Android framework required. */
public class CampaignQueueTest {
    @Test public void resumedQueueKeepsTheFirstUnprocessedRecipient() {
        BulkCampaignStore.Campaign campaign = new BulkCampaignStore.Campaign();
        campaign.recipients.add(new BulkCampaignStore.Recipient("Иван", "79991234567",
                BulkCampaignStore.STATUS_PREPARED));
        campaign.recipients.add(new BulkCampaignStore.Recipient("Мария", "79997654321",
                BulkCampaignStore.STATUS_OPENED));
        campaign.recipients.add(new BulkCampaignStore.Recipient("Никита", "79992345678",
                BulkCampaignStore.STATUS_PENDING));
        campaign.currentIndex = 0;
        campaign.advanceIndex();
        assertEquals(1, campaign.currentIndex);
        assertEquals(BulkCampaignStore.STATUS_OPENED, campaign.current().status);
        assertEquals(1, campaign.preparedCount());
        assertFalse(campaign.complete());
    }

    @Test public void completedQueueCountsPreparedAndSkippedPrecisely() {
        BulkCampaignStore.Campaign campaign = new BulkCampaignStore.Campaign();
        campaign.recipients.add(new BulkCampaignStore.Recipient("1", "79991234567",
                BulkCampaignStore.STATUS_PREPARED));
        campaign.recipients.add(new BulkCampaignStore.Recipient("2", "79997654321",
                BulkCampaignStore.STATUS_SKIPPED));
        campaign.recipients.add(new BulkCampaignStore.Recipient("3", "79992345678",
                BulkCampaignStore.STATUS_PREPARED));
        campaign.advanceIndex();
        assertTrue(campaign.complete());
        assertEquals(2, campaign.preparedCount());
        assertEquals(1, campaign.skippedCount());
        assertEquals(3, campaign.processedCount());
    }
}
