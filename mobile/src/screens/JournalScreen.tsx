import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api/client';
import { kvGet, kvSet } from '../offline/db';
import { useData } from '../store/data';
import { colors } from '../theme';
import { REASON_LABEL, REASONS, type DistractionReason, type DistractionStats } from '../types';
import { Button, Card, Chip, Chips, Empty, Field, H1, H3, Muted, ProgressBar, Row, SyncBar, s } from '../components/ui';
import { LOCALE, tr } from '../i18n';

const ICON: Record<string, string> = { ...Object.fromEntries(REASONS.map((r) => [r.value, r.icon])), left_app: '' };

export function JournalScreen() {
  const { distractions, subjects, sync, remove } = useData();
  const [stats, setStats] = useState<DistractionStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const st = await api<DistractionStats>('/distractions/stats?days=30');
      setStats(st);
      await kvSet('distractionStats', st);
    } catch {
      setStats(await kvGet<DistractionStats>('distractionStats'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const max = Math.max(1, ...(stats?.byReason.map((r) => r.count) ?? [1]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <SyncBar />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await sync();
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <H1>{tr('Nhật ký phân tâm')}</H1>
          <Button title="+ Ghi" small onPress={() => setAdding(true)} />
        </Row>

        {stats && (
          <>
            <Row>
              {[
                [tr('Ghi nhận'), String(stats.manualCount)],
                [tr('Rời app'), String(stats.autoCount)],
                [tr('Mỗi giờ'), stats.perFocusHour != null ? String(stats.perFocusHour) : '—'],
              ].map(([l, v]) => (
                <Card key={l} style={{ flex: 1, gap: 2, padding: 12 }}>
                  <Muted>{l}</Muted>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>{v}</Text>
                </Card>
              ))}
            </Row>
            {stats.insights.length > 0 && (
              <Card style={{ backgroundColor: colors.markerSoft, borderColor: '#f0d77a' }}>
                <H3>{tr('Gợi ý')}</H3>
                {stats.insights.map((i) => (
                  <Text key={i} style={{ color: colors.text }}>
                    • {i}
                  </Text>
                ))}
              </Card>
            )}
            <Card>
              <H3>{tr('Nguyên nhân (30 ngày)')}</H3>
              {stats.byReason.length === 0 && <Empty text={tr('Chưa có dữ liệu.')} />}
              {stats.byReason.map((r) => (
                <View key={r.reason} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text }}>
                      {ICON[r.reason]} {r.label}
                    </Text>
                    <Text style={{ fontWeight: '700' }}>{r.count}</Text>
                  </Row>
                  <ProgressBar value={r.count / max} />
                </View>
              ))}
            </Card>
          </>
        )}

        <Card>
          <H3>{tr('Lịch sử')}</H3>
          {distractions.length === 0 && <Empty text={tr('Chưa có ghi nhận nào ')} />}
          {distractions.slice(0, 50).map((d) => {
            const subj = subjects.find((x) => x.id === d.subject);
            return (
              <Pressable
                key={d.id}
                onLongPress={() =>
                  Alert.alert(tr('Xoá ghi nhận?'), REASON_LABEL[d.reason], [
                    { text: tr('Huỷ'), style: 'cancel' },
                    { text: tr('Xoá'), style: 'destructive', onPress: () => void remove('distractions', d.id) },
                  ])
                }
              >
                <Row style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: d.source === 'auto' ? colors.borderStrong : colors.danger }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '600', color: colors.text }}>
                      {REASON_LABEL[d.reason]} {d.source === 'auto' ? tr('(tự động)') : ''}
                    </Text>
                    <Muted>
                      {new Date(d.occurredAt).toLocaleString(LOCALE)}
                      {subj ? ` · ${subj.name}` : ''}
                      {d.minuteIntoSession != null ? tr(' · phút {0}', Math.round(d.minuteIntoSession)) : ''}
                      {d.note ? ` · ${d.note}` : ''}
                    </Muted>
                  </View>
                </Row>
              </Pressable>
            );
          })}
        </Card>
      </ScrollView>
      <AddDistraction visible={adding} onClose={() => setAdding(false)} />
    </SafeAreaView>
  );
}

function AddDistraction({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { subjects, create } = useData();
  const [reason, setReason] = useState<DistractionReason | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [note, setNote] = useState('');
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)' }} onPress={onClose} />
      <View style={{ backgroundColor: colors.surface, padding: 20, gap: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
        <Text style={[s.h3, { fontSize: 18 }]}>{tr('Ghi nhận phân tâm')}</Text>
        <Chips>
          {REASONS.map((r) => (
            <Chip key={r.value} label={`${r.icon} ${r.label}`} active={reason === r.value} onPress={() => setReason(r.value)} />
          ))}
        </Chips>
        <Text style={s.label}>{tr('Môn học')}</Text>
        <Chips>
          <Chip label={tr('Không')} active={!subject} onPress={() => setSubject(null)} />
          {subjects.map((x) => (
            <Chip key={x.id} label={x.name} active={subject === x.id} onPress={() => setSubject(x.id)} />
          ))}
        </Chips>
        <Field label={tr('Ghi chú')} value={note} onChangeText={setNote} />
        <Button
          title={tr('Lưu')}
          disabled={!reason}
          onPress={async () => {
            await create('distractions', { reason, subject, note, device: 'android', occurredAt: new Date().toISOString() });
            setReason(null);
            setNote('');
            onClose();
          }}
        />
      </View>
    </Modal>
  );
}
