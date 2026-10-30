package com.githubstars.service;

import com.githubstars.entity.QuotaLedger;
import com.githubstars.entity.UsageDaily;
import com.githubstars.mapper.QuotaLedgerMapper;
import com.githubstars.mapper.UsageDailyMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class QuotaServiceTest {

    private UsageDailyMapper usageDailyMapper;
    private QuotaLedgerMapper quotaLedgerMapper;
    private QuotaService service;

    @BeforeEach
    void setUp() {
        usageDailyMapper = mock(UsageDailyMapper.class);
        quotaLedgerMapper = mock(QuotaLedgerMapper.class);
        service = new QuotaService(usageDailyMapper, quotaLedgerMapper, 30, 3, 200_000, 8_000);
    }

    @Test
    void idemKeyIsStableForSameLogicalRequest() {
        String first = QuotaService.idemKey(1L, QuotaKind.CHAT, "turn-1", "fp-1", "req-1");
        String retry = QuotaService.idemKey(1L, QuotaKind.CHAT, "turn-1", "fp-1", "req-2");
        String nextTurn = QuotaService.idemKey(1L, QuotaKind.CHAT, "turn-2", "fp-2", "req-3");

        assertEquals(first, retry);
        assertFalse(first.equals(nextTurn));
    }

    @Test
    void replayedReservationDoesNotIncrementUsage() {
        QuotaLedger existing = ledger();
        existing.setState("reserved");
        existing.setUsedAfter(1);
        when(quotaLedgerMapper.insertIgnore(any(), anyLong(), any(), any(), any(), any(), any(), any()))
                .thenReturn(0);
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(existing);

        QuotaService.Reservation reservation = service.reserve(
                7L, QuotaKind.CHAT, "turn-1", "fp-1", "req-1");

        assertTrue(reservation.allowed());
        assertTrue(reservation.replayed());
        assertEquals(1, reservation.used());
        verify(usageDailyMapper, never()).incrementChatIfBelow(anyLong(), any(), anyInt());
    }

    @Test
    void newReservationIncrementsAndRecordsUsedAfter() {
        when(quotaLedgerMapper.insertIgnore(any(), anyLong(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);
        when(usageDailyMapper.selectByUserDay(anyLong(), any())).thenReturn(daily(2, 0, 0));
        when(usageDailyMapper.incrementChatIfBelow(anyLong(), any(), eq(30))).thenReturn(1);

        QuotaService.Reservation reservation = service.reserve(
                7L, QuotaKind.CHAT, "turn-1", "fp-1", "req-1");

        assertTrue(reservation.allowed());
        assertFalse(reservation.replayed());
        assertEquals(2, reservation.used());
        verify(quotaLedgerMapper).markReserved(any(), any(), eq(2), any());
    }

    @Test
    void quotaExceededReleasesUnchargedLedgerRow() {
        when(quotaLedgerMapper.insertIgnore(any(), anyLong(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);
        when(usageDailyMapper.selectByUserDay(anyLong(), any())).thenReturn(daily(30, 0, 0));
        when(usageDailyMapper.incrementChatIfBelow(anyLong(), any(), eq(30))).thenReturn(0);

        QuotaService.Reservation reservation = service.reserve(
                7L, QuotaKind.CHAT, "turn-1", "fp-1", "req-1");

        assertFalse(reservation.allowed());
        assertEquals("quota_exceeded", reservation.reason());
        verify(quotaLedgerMapper).markReleased(any(), eq("quota_exceeded"), eq(30), any());
    }

    @Test
    void tokenBudgetBlocksEvenWhenRequestQuotaRemains() {
        when(quotaLedgerMapper.insertIgnore(any(), anyLong(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);
        when(usageDailyMapper.selectByUserDay(anyLong(), any()))
                .thenReturn(daily(1, 0, 200_000));

        QuotaService.Reservation reservation = service.reserve(
                7L, QuotaKind.COMPARE, "fp-1", "fp-1", "req-1");

        assertFalse(reservation.allowed());
        assertEquals("token_budget_exceeded", reservation.reason());
        verify(usageDailyMapper, never()).incrementCompareIfBelow(anyLong(), any(), anyInt());
    }

    @Test
    void releaseDecrementsOnlyOnce() {
        QuotaLedger reserved = ledger();
        reserved.setState("reserved");
        reserved.setCharged(true);
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(reserved);
        when(usageDailyMapper.selectByUserDay(anyLong(), any())).thenReturn(daily(1, 0, 0));
        when(usageDailyMapper.decrementChat(anyLong(), any(), anyInt())).thenReturn(1);

        assertTrue(service.release("key", "cancelled"));
        verify(usageDailyMapper).decrementChat(anyLong(), any(), eq(1));
        verify(quotaLedgerMapper).markReleased(any(), eq("cancelled"), eq(1), any());

        QuotaLedger released = ledger();
        released.setState("released");
        released.setCharged(true);
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(released);

        assertTrue(service.release("key", "cancelled"));
        // 两次 release 合计只归还一次
        verify(usageDailyMapper, times(1)).decrementChat(anyLong(), any(), anyInt());
    }

    @Test
    void crossDayReplayUsesTodayUsage() {
        QuotaLedger existing = ledger();
        existing.setState("committed");
        existing.setDay(LocalDate.now().minusDays(1));
        existing.setUsedAfter(29);
        when(quotaLedgerMapper.insertIgnore(any(), anyLong(), any(), any(), any(), any(), any(), any()))
                .thenReturn(0);
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(existing);
        when(usageDailyMapper.selectByUserDay(anyLong(), any())).thenReturn(daily(2, 0, 0));

        QuotaService.Reservation reservation = service.reserve(
                7L, QuotaKind.CHAT, "turn-1", "fp-1", "req-1");

        assertTrue(reservation.allowed());
        assertTrue(reservation.replayed());
        assertEquals(2, reservation.used());
    }

    @Test
    void commitAddsWeightedExtraUnits() {
        QuotaLedger reserved = ledger();
        reserved.setState("reserved");
        reserved.setCharged(true);
        reserved.setUsedAfter(1);
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(reserved);
        when(quotaLedgerMapper.markCommitted(any(), anyLong(), anyLong(), any(), any())).thenReturn(1);
        when(usageDailyMapper.selectByUserDay(anyLong(), any())).thenReturn(daily(3, 0, 0));

        assertTrue(service.commit(7L, QuotaKind.CHAT, "key", 16_000, 0, "req-1"));

        verify(usageDailyMapper).addTokens(anyLong(), any(), eq(16_000L), eq(0L));
        // 16000 tokens / 8000 = 2 次额外额度
        verify(usageDailyMapper).addChatCount(anyLong(), any(), eq(2));
    }

    @Test
    void commitWithoutTokensAddsNoExtraUnits() {
        QuotaLedger reserved = ledger();
        reserved.setState("reserved");
        reserved.setCharged(true);
        reserved.setUsedAfter(1);
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(reserved);
        when(quotaLedgerMapper.markCommitted(any(), anyLong(), anyLong(), any(), any())).thenReturn(1);

        assertTrue(service.commit(7L, QuotaKind.CHAT, "key", 100, 0, null));

        verify(usageDailyMapper, never()).addChatCount(anyLong(), any(), anyInt());
        verify(usageDailyMapper, never()).addCompareCount(anyLong(), any(), anyInt());
    }

    @Test
    void refundReturnsWeightedUnitsAndIsIdempotent() {
        QuotaLedger committed = ledger();
        committed.setState("committed");
        committed.setCharged(true);
        committed.setTokensIn(16_000L);
        committed.setTokensOut(0L);
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(committed);
        when(usageDailyMapper.selectByUserDay(anyLong(), any())).thenReturn(daily(3, 0, 0));

        assertTrue(service.refund("key", null, "用户申诉补退"));
        // 基础 1 次 + 16000/8000 = 2 次加权
        verify(usageDailyMapper).decrementChat(anyLong(), any(), eq(3));

        QuotaLedger refunded = ledger();
        refunded.setState("refunded");
        when(quotaLedgerMapper.selectForUpdate(any())).thenReturn(refunded);

        assertTrue(service.refund("key", null, "重复补退"));
        verify(usageDailyMapper, times(1)).decrementChat(anyLong(), any(), anyInt());
    }

    private static QuotaLedger ledger() {
        QuotaLedger row = new QuotaLedger();
        row.setIdemKey("key");
        row.setUserId(7L);
        row.setKind("chat");
        row.setDay(LocalDate.now());
        row.setCharged(false);
        return row;
    }

    private static UsageDaily daily(int chat, int compare, long tokens) {
        UsageDaily daily = new UsageDaily();
        daily.setUserId(1L);
        daily.setChatCount(chat);
        daily.setCompareCount(compare);
        daily.setTokensIn(tokens);
        daily.setTokensOut(0L);
        return daily;
    }
}
