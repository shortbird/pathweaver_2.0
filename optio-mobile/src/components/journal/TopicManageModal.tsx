/**
 * Topic Manage Modal - Edit and delete interest tracks.
 *
 * Bottom-sheet modal for managing topics: rename, change color, delete.
 * Deleting a topic unassigns all its moments (handled by backend).
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';

const PRESET_COLORS = [
  '#6D469B', // purple (primary)
  '#EF597B', // pink (accent)
  '#2469D1', // blue (stem)
  '#AF56E5', // violet (art)
  '#3DA24A', // green (communication)
  '#FF9028', // orange (civics)
  '#E65C5C', // red (wellness)
  '#2BA5A5', // teal
  '#8B9A3C', // olive
  '#3366CC', // navy
];

interface InterestTrack {
  id: string;
  name: string;
  color: string;
  moment_count: number;
}

interface TopicManageModalProps {
  visible: boolean;
  onClose: () => void;
  tracks: InterestTrack[];
  onUpdate: (trackId: string, name: string, color: string) => Promise<void>;
  onDelete: (trackId: string, trackName: string) => Promise<void>;
}

export function TopicManageModal({
  visible,
  onClose,
  tracks,
  onUpdate,
  onDelete,
}: TopicManageModalProps) {
  const { colors } = useThemeStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);

  const startEditing = (track: InterestTrack) => {
    setEditingId(track.id);
    setEditName(track.name);
    setEditColor(track.color || colors.primary);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleSave = async () => {
    if (!editingId || !editName.trim() || saving) return;
    setSaving(true);
    try {
      await onUpdate(editingId, editName.trim(), editColor);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (track: InterestTrack) => {
    const countMsg = track.moment_count > 0
      ? `\n\n${track.moment_count} ${track.moment_count === 1 ? 'moment' : 'moments'} will become unassigned.`
      : '';
    Alert.alert(
      'Delete Topic',
      `Delete "${track.name}"?${countMsg}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await onDelete(track.id, track.name);
              if (editingId === track.id) cancelEditing();
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const handleClose = () => {
    cancelEditing();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <View />
      </Pressable>
      <View style={[styles.sheet, { backgroundColor: colors.surfaceOpaque }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>Manage Topics</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {tracks.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No topics yet.</Text>
          )}

          {tracks.map((track) => {
            const isEditing = editingId === track.id;

            if (isEditing) {
              return (
                <View key={track.id} style={[styles.editCard, { backgroundColor: colors.background }]}>
                  {/* Name input */}
                  <TextInput
                    style={[styles.editInput, { borderColor: colors.border, color: colors.text }]}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Topic name"
                    placeholderTextColor={colors.textMuted}
                    autoFocus
                    selectTextOnFocus
                  />

                  {/* Color picker */}
                  <Text style={[styles.colorLabel, { color: colors.textMuted }]}>Color</Text>
                  <View style={styles.colorRow}>
                    {PRESET_COLORS.map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: c },
                          editColor === c && styles.colorSwatchActive,
                        ]}
                        onPress={() => setEditColor(c)}
                      >
                        {editColor === c && (
                          <Ionicons name="checkmark" size={14} color="#FFF" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Actions */}
                  <View style={styles.editActions}>
                    <TouchableOpacity onPress={cancelEditing} style={styles.editCancelBtn}>
                      <Text style={[styles.editCancelText, { color: colors.textMuted }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editSaveBtn, { backgroundColor: colors.primary }, (!editName.trim() || saving) && { opacity: 0.5 }]}
                      onPress={handleSave}
                      disabled={!editName.trim() || saving}
                    >
                      {saving ? (
                        <ActivityIndicator size={14} color="#FFF" />
                      ) : (
                        <Text style={styles.editSaveText}>Save</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            return (
              <View key={track.id} style={[styles.trackRow, { borderBottomColor: colors.border }]}>
                <View style={[styles.trackDot, { backgroundColor: track.color || colors.primary }]} />
                <Text style={[styles.trackName, { color: colors.text }]} numberOfLines={1}>{track.name}</Text>
                <Text style={[styles.trackCount, { color: colors.textMuted }]}>{track.moment_count}</Text>
                <TouchableOpacity
                  onPress={() => startEditing(track)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.iconBtn}
                >
                  <Ionicons name="pencil-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(track)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.iconBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    paddingBottom: tokens.spacing.xl,
    maxHeight: '65%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  },
  emptyText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
    paddingVertical: tokens.spacing.lg,
  },

  // Track row (view mode)
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: tokens.spacing.sm,
  },
  trackDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  trackName: {
    flex: 1,
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.medium,
  },
  trackCount: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  iconBtn: {
    padding: 4,
  },

  // Edit card (edit mode)
  editCard: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    marginVertical: tokens.spacing.xs,
  },
  editInput: {
    borderWidth: 0.5,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.medium,
    marginBottom: tokens.spacing.sm,
  },
  colorLabel: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.medium,
    marginBottom: tokens.spacing.xs,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchActive: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    ...tokens.shadows.md,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: tokens.spacing.sm,
  },
  editCancelBtn: {
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  editCancelText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },
  editSaveBtn: {
    borderRadius: tokens.radius.md,
    paddingVertical: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.md,
  },
  editSaveText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
    color: '#FFF',
  },
});
