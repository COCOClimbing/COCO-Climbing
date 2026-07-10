import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  FlatList, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { FONTS, SPACING } from '../utils/theme';
import { useTheme } from '../utils/ThemeContext';

const RECENT_KEY = 'coco_recent_locations';
const MAX_RECENT = 8;

interface SearchResult {
  id: string;
  primary: string;
  secondary: string;
  fullName: string;
}

async function getRecentLocations(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveRecentLocation(name: string) {
  const recent = await getRecentLocations();
  const updated = [name, ...recent.filter(r => r !== name)].slice(0, MAX_RECENT);
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(updated));
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  address: {
    amenity?: string;
    building?: string;
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
  };
}

async function searchPlaces(query: string): Promise<SearchResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'COCO-ClimbingApp/1.0' } });
  const data: NominatimResult[] = await res.json();
  const seen = new Set<string>();
  return data
    .map(r => {
      const a = r.address;
      const placeName = a.amenity || a.building || r.name || '';
      const streetLine = [a.house_number, a.road].filter(Boolean).join(' ');
      const cityLine = [a.city || a.town || a.village, a.state].filter(Boolean).join(', ');
      const primary = placeName || streetLine || cityLine || r.display_name.split(',')[0];
      const secondary = [placeName ? streetLine : '', cityLine].filter(Boolean).join(', ');
      const fullName = placeName
        ? `${placeName}${a.city || a.town ? `, ${a.city || a.town}` : ''}`
        : [streetLine, a.city || a.town].filter(Boolean).join(', ');
      return { id: `n-${r.place_id}`, primary, secondary, fullName: fullName || primary };
    })
    .filter(r => {
      const key = r.fullName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
}

export default function LocationPicker({ value, onChange, editable = true }: Props) {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [recentLocations, setRecentLocations] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (modalVisible) {
      setSearchText(value);
      setLocationError('');
      setSearchResults([]);
      getRecentLocations().then(setRecentLocations);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [modalVisible]);

  // Debounced place search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (searchText.trim().length < 3) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(searchText.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
      setSearching(false);
    }, 400);
  }, [searchText]);

  const filteredRecent = recentLocations.filter(
    r => r.toLowerCase().includes(searchText.toLowerCase()) && r !== searchText
  );

  async function handleUseCurrentLocation() {
    setLocating(true);
    setLocationError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied.');
        setLocating(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const results = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (results.length > 0) {
        const r = results[0];
        const placeName = r.name && !r.name.match(/^\d/) ? r.name : null;
        const formatted = placeName
          ? `${placeName}${r.city ? `, ${r.city}` : ''}`
          : [[r.streetNumber, r.street].filter(Boolean).join(' '), r.city].filter(Boolean).join(', ');
        setSearchText(formatted || '');
      }
    } catch {
      setLocationError('Could not get location. Try again.');
    }
    setLocating(false);
  }

  function handleConfirm(text: string) {
    const trimmed = text.trim();
    if (trimmed) saveRecentLocation(trimmed);
    onChange(trimmed);
    setModalVisible(false);
  }

  function handleSelect(name: string) {
    saveRecentLocation(name);
    onChange(name);
    setModalVisible(false);
  }

  function handleClear() {
    onChange('');
    setModalVisible(false);
  }

  const showSearchResults = searchResults.length > 0;
  const showRecent = !showSearchResults && filteredRecent.length > 0;

  return (
    <>
      <TouchableOpacity
        style={[styles.field, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => editable && setModalVisible(true)}
        activeOpacity={editable ? 0.7 : 1}
        disabled={!editable}
      >
        <Ionicons name="location-outline" size={16} color={value ? colors.textSecondary : colors.textMuted} />
        <Text
          style={[styles.fieldText, { color: value ? colors.textPrimary : colors.textMuted, fontFamily: FONTS.family.regular }]}
          numberOfLines={1}
        >
          {value || 'Location / gym / crag'}
        </Text>
        {editable ? (
          value ? (
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onChange(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          )
        ) : null}
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={[styles.modal, { backgroundColor: colors.bg }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.headerBtn}>
              <Text style={[styles.cancelText, { color: colors.textSecondary, fontFamily: FONTS.family.regular }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary, fontFamily: FONTS.family.semibold }]}>
              Location
            </Text>
            <TouchableOpacity onPress={() => handleConfirm(searchText)} style={styles.headerBtn}>
              <Text style={[styles.doneText, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search input */}
          <View style={[styles.searchRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            {searching ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons name="search" size={16} color={colors.textMuted} />
            )}
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: colors.textPrimary, fontFamily: FONTS.family.regular }]}
              placeholder="Search gym, crag, or address..."
              placeholderTextColor={colors.textMuted}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="done"
              onSubmitEditing={() => handleConfirm(searchText)}
              autoCorrect={false}
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* GPS button */}
          <TouchableOpacity
            style={[styles.gpsBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            onPress={handleUseCurrentLocation}
            activeOpacity={0.7}
            disabled={locating}
          >
            {locating ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="navigate-outline" size={18} color={colors.accent} />
            )}
            <Text style={[styles.gpsBtnText, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>
              {locating ? 'Finding location…' : 'Use current location'}
            </Text>
          </TouchableOpacity>

          {locationError ? (
            <Text style={[styles.errorText, { color: colors.danger }]}>{locationError}</Text>
          ) : null}

          {/* Search results */}
          {showSearchResults && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RESULTS</Text>
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.resultRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleSelect(item.fullName)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="location-outline" size={16} color={colors.textMuted} style={styles.resultIcon} />
                    <View style={styles.resultText}>
                      <Text style={[styles.resultPrimary, { color: colors.textPrimary, fontFamily: FONTS.family.regular }]}>
                        {item.primary}
                      </Text>
                      {item.secondary ? (
                        <Text style={[styles.resultSecondary, { color: colors.textMuted, fontFamily: FONTS.family.regular }]}>
                          {item.secondary}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {/* Recent locations */}
          {showRecent && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                {searchText ? 'RECENT' : 'RECENT LOCATIONS'}
              </Text>
              <FlatList
                data={filteredRecent}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.resultRow, { borderBottomColor: colors.border }]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={16} color={colors.textMuted} style={styles.resultIcon} />
                    <View style={styles.resultText}>
                      <Text style={[styles.resultPrimary, { color: colors.textPrimary, fontFamily: FONTS.family.regular }]}>
                        {item}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {/* Clear location option */}
          {value ? (
            <TouchableOpacity style={styles.clearLocation} onPress={handleClear} activeOpacity={0.7}>
              <Text style={[styles.clearLocationText, { color: colors.danger, fontFamily: FONTS.family.regular }]}>
                Remove location
              </Text>
            </TouchableOpacity>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  fieldText: { flex: 1, fontSize: FONTS.sizes.md },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
  },
  headerBtn: { minWidth: 60 },
  cancelText: { fontSize: FONTS.sizes.md },
  doneText: { fontSize: FONTS.sizes.md, textAlign: 'right' },
  modalTitle: { fontSize: FONTS.sizes.lg },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.md, paddingVertical: SPACING.sm },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderRadius: 10,
    borderWidth: 1,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  gpsBtnText: { fontSize: FONTS.sizes.md },
  errorText: { fontSize: FONTS.sizes.sm, marginHorizontal: SPACING.lg, marginTop: SPACING.sm },
  sectionLabel: {
    fontSize: FONTS.sizes.xs,
    letterSpacing: 1.5,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultIcon: { marginRight: SPACING.md },
  resultText: { flex: 1 },
  resultPrimary: { fontSize: FONTS.sizes.md },
  resultSecondary: { fontSize: FONTS.sizes.sm, marginTop: 2 },
  clearLocation: { padding: SPACING.lg, alignItems: 'center', marginTop: SPACING.md },
  clearLocationText: { fontSize: FONTS.sizes.md },
});
