/**
 * Topic Assign Modal - Bottom-sheet-style modal for batch topic assignment.
 *
 * Shows available topics as tappable chips. Tapping assigns all selected
 * moments to that topic. Includes inline "New Topic" creation.
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
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../theme/tokens';

interface InterestTrack {
  id: string;
  name: string;
  color: string;
  moment_count: number;
}

interface TopicAssignModalProps {
  visible: boolean;
  onClose: () => void;
  tracks: InterestTrack[];
  selectedCount: number;
  onAssign: (trackId: string) => Promise<void>;
  onCreateAndAssign: (name: string) => Promise<void>;
}

export function TopicAssignModal({
  visible,
  onClose,
  tracks,
  selectedCount,
  onAssign,
  onCreateAndAssign,
}: TopicAssignModalProps) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const handleAssign = async (trackId: string) => {
    if (assigning) return;
    setAssigning(true);
    setAssigningId(trackId);
    try {
      await onAssign(trackId);
    } finally {
      setAssigning(false);
      setAssigningId(null);
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed || assigning) return;
    setAssigning(true);
    setAssigningId('__new__');
    try {
      await onCreateAndAssign(trimmed);
      setNewName('');
      setShowNewInput(false);
    } finally {
      setAssigning(false);
      setAssigningId(null);
    }
  };

  const handleClose = () => {
    if (assigning) return;
    setShowNewInput(false);
    setNewName('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>
            Assign {selectedCount} {selectedCount === 1 ? 'moment' : 'moments'}
          </Text>

          <ScrollView
            style={styles.trackList}
            contentContainerStyle={styles.trackListContent}
            keyboardShouldPersistTaps="handled"
          >
            {tracks.map((track) => {
              const isAssigning = assigningId === track.id;
              return (
                <TouchableOpacity
                  key={track.id}
                  style={[
                    styles.trackRow,
                    isAssigning && { opacity: 0.6 },
                  ]}
                  onPress={() => handleAssign(track.id)}
                  disabled={assigning}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.trackDot,
                      { backgroundColor: track.color || tokens.colors.primary },
                    ]}
                  />
                  <Text style={styles.trackName} numberOfLines={1}>
                    {track.name}
                  </Text>
                  <Text style={styles.trackCount}>{track.moment_count}</Text>
                  {isAssigning ? (
                    <ActivityIndicator
                      size={16}
                      color={track.color || tokens.colors.primary}
                    />
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={tokens.colors.textMuted}
                    />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* New topic row */}
            {showNewInput ? (
              <View style={styles.newTrackRow}>
                <TextInput
                  style={styles.newTrackInput}
                  placeholder="Topic name"
                  placeholderTextColor={tokens.colors.textMuted}
                  value={newName}
                  onChangeText={setNewName}
                  autoFocus
                  onSubmitEditing={handleCreate}
                />
                <TouchableOpacity
                  style={[
                    styles.createBtn,
                    (!newName.trim() || assigning) && { opacity: 0.5 },
                  ]}
                  onPress={handleCreate}
                  disabled={!newName.trim() || assigning}
                >
                  {assigningId === '__new__' ? (
                    <ActivityIndicator size={14} color="#FFF" />
                  ) : (
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowNewInput(false);
                    setNewName('');
                  }}
                  style={styles.cancelNewBtn}
                >
                  <Text style={styles.cancelNewText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.newTopicRow}
                onPress={() => setShowNewInput(true)}
                disabled={assigning}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color={tokens.colors.primary}
                />
                <Text style={styles.newTopicText}>New Topic</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: tokens.radius.xl,
    borderTopRightRadius: tokens.radius.xl,
    paddingBottom: tokens.spacing.xl,
    maxHeight: '60%',
    ...tokens.shadows.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.colors.border,
    alignSelf: 'center',
    marginTop: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  title: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
    color: tokens.colors.text,
    paddingHorizontal: tokens.spacing.lg,
    marginBottom: tokens.spacing.md,
  },
  trackList: {
    flexGrow: 0,
  },
  trackListContent: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.md,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.border,
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
    color: tokens.colors.text,
  },
  trackCount: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    color: tokens.colors.textMuted,
    marginRight: tokens.spacing.xs,
  },
  newTopicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  newTopicText: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.medium,
    color: tokens.colors.primary,
  },
  newTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  newTrackInput: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: tokens.colors.border,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    color: tokens.colors.text,
  },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelNewBtn: {
    paddingHorizontal: tokens.spacing.sm,
  },
  cancelNewText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
    color: tokens.colors.textMuted,
  },
});
