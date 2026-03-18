/**
 * Create Yeti Modal - Name input for first-time Yeti creation.
 *
 * Shown when a student has no Yeti yet. Posts to /api/yeti/my-pet.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { tokens } from '../../theme/tokens';
import { useThemeStore } from '../../stores/themeStore';
import { useYetiStore } from '../../stores/yetiStore';

interface CreateYetiModalProps {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateYetiModal({ visible, onClose, onCreated }: CreateYetiModalProps) {
  const { colors } = useThemeStore();
  const [name, setName] = useState('');
  const { createPet, isLoading, error, clearError } = useYetiStore();

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) return;
    try {
      await createPet(trimmed);
      setName('');
      onCreated();
    } catch {
      // Error set in store
    }
  };

  const handleClose = () => {
    setName('');
    clearError();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: colors.surfaceOpaque }]}>
            <Text style={[styles.title, { color: colors.primary }]}>Name Your Yeti</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Your Yeti companion will be with you on your learning journey.
              Give them a name!
            </Text>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.error + '15' }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              </View>
            ) : null}

            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              placeholder="Enter a name..."
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) clearError();
              }}
              maxLength={20}
              autoFocus
              autoCapitalize="words"
            />

            <Text style={[styles.charCount, { color: colors.textMuted }]}>{name.trim().length}/20</Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.cancelButton, { borderColor: colors.border }]} onPress={handleClose}>
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.createButton,
                  { backgroundColor: colors.primary },
                  (isLoading || name.trim().length < 2) && styles.buttonDisabled,
                ]}
                onPress={handleCreate}
                disabled={isLoading || name.trim().length < 2}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.createText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing.lg,
    ...tokens.shadows.lg,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontWeight: tokens.typography.weights.bold,
    textAlign: 'center',
    marginBottom: tokens.spacing.sm,
  },
  subtitle: {
    fontSize: tokens.typography.sizes.sm,
    textAlign: 'center',
    marginBottom: tokens.spacing.lg,
    lineHeight: 20,
  },
  errorBox: {
    borderRadius: tokens.radius.sm,
    padding: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  errorText: {
    fontSize: tokens.typography.sizes.sm,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    fontSize: tokens.typography.sizes.lg,
    textAlign: 'center',
  },
  charCount: {
    fontSize: tokens.typography.sizes.xs,
    textAlign: 'right',
    marginTop: tokens.spacing.xs,
    marginBottom: tokens.spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  cancelButton: {
    flex: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.medium,
  },
  createButton: {
    flex: 1,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    alignItems: 'center',
  },
  createText: {
    fontSize: tokens.typography.sizes.md,
    fontWeight: tokens.typography.weights.semiBold,
    color: '#FFF',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
