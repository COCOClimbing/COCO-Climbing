# Active Session Card + Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the active/in-progress session from an always-fully-expanded inline card at the top of the Sessions tab into a compact tappable card (badge, title, stats) — tapping it opens the exact same editable content (title, notes, location, climbing-with, media, climbs list, End Session, Share, Edit Date) that's inline today, now inside a full-screen modal. Closed session cards, the condensed toggle, and everything else on the Sessions tab are unaffected.

**Architecture:** `ActiveSessionCard` (nested inside `SessionsScreen` in `app/sessions.tsx`) keeps all its existing state and handlers completely unchanged. Its single `return` statement splits into two pieces: a new compact `TouchableOpacity` card (badge + title + stats, read-only, opens the modal on tap) rendered directly in the list, and the modal — which contains the *exact* existing JSX (title editing, stats, climbs, notes, location, climbing with, media, actions) byte-for-byte unchanged, just wrapped in a `<Modal>` with a "Done" top bar matching the existing closed-session Edit modal's shell (`detailContainer`/`detailTopBar`/`backBtn`/`backBtnText`/`detailContent` styles, already defined and used by `SessionEditModalContent`).

**Tech Stack:** React Native / Expo, TypeScript.

---

### Task 1: Split `ActiveSessionCard` into a compact card + modal

**Files:**
- Modify: `app/sessions.tsx`

- [ ] **Step 1: Add modal-visibility state**

Add a new state line immediately after the existing `activeMediaItems` state declaration (currently `app/sessions.tsx:655`):

```ts
    const [activeMediaItems, setActiveMediaItems] = useState<{ uri: string; type: 'photo' | 'video' }[]>([]);
    const [activeSessionModalVisible, setActiveSessionModalVisible] = useState(false);
```

- [ ] **Step 2: Replace the entire `return` statement**

Replace this whole block (currently `app/sessions.tsx:689-932`, from the opening `return (` through the matching closing `);`):

```tsx
    return (
      <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.accent, borderWidth: 2, gap: SPACING.md, marginBottom: SPACING.md }]}>
        {/* Active badge */}
        <View style={styles.activeBadgeRow}>
          <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.detailDay, { color: colors.accent }]}>ACTIVE SESSION</Text>
        </View>

        {/* Editable title */}
        {activeEditingTitle ? (
          <TextInput
            style={[styles.detailTitle, styles.detailTitleInput, { color: colors.textPrimary, borderColor: colors.border }]}
            defaultValue={activeTitle || sessionTimeOfDay(activeSession)}
            onChangeText={t => { activeTitleInputValue.current = t; }}
            onEndEditing={e => {
              const t = e.nativeEvent.text.trim();
              setActiveTitle(t);
              setActiveEditingTitle(false);
              handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, activeLocation, activeMediaItems, t);
            }}
            onSubmitEditing={e => {
              const t = e.nativeEvent.text.trim();
              setActiveTitle(t);
              setActiveEditingTitle(false);
              handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, activeLocation, activeMediaItems, t);
            }}
            placeholder={sessionTimeOfDay(activeSession)}
            placeholderTextColor={colors.textMuted}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity
            style={styles.detailTitleRow}
            onPress={() => { activeTitleInputValue.current = activeTitle; setActiveEditingTitle(true); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.detailTitle, { color: colors.textPrimary, flex: 1 }]}>
              {activeTitle.trim() || sessionTimeOfDay(activeSession)}
            </Text>
            <Ionicons name="pencil-outline" size={16} color={colors.textMuted} style={{ marginLeft: 6, marginTop: 3 }} />
          </TouchableOpacity>
        )}

        {/* Stats row */}
        <View style={[styles.detailStatsRow, { borderTopColor: colors.border }]}>
          {projecting ? (
            <Text style={[styles.todayStatLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
          ) : (
            <>
              <View style={styles.todayStat}>
                <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{gradedCount}</Text>
                <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>climbs</Text>
              </View>
              <View style={styles.todayStat}>
                <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{sends}</Text>
                <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>sends</Text>
              </View>
            </>
          )}
          {hardest && (
            <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
              <Text style={[styles.hardestText, { color: hardestTypeColor }]}>{hardest.grade}</Text>
            </View>
          )}
        </View>

        {/* Climbs */}
        {activeSession.climbs.length === 0 ? (
          <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
        ) : (
          activeSession.climbs.map(c => (
            <SwipeToDelete
              key={c.id}
              onSwipeStart={() => setListScrollEnabled(false)}
              onSwipeEnd={() => setListScrollEnabled(true)}
              onDelete={async () => { await deleteClimb(c.id); triggerStatsRefresh(); load(); }}
              rightAction={c.outcome === 'attempt' ? {
                label: 'Send',
                color: colors.accentGreen,
                onPress: async () => {
                  await saveClimb({ ...c, outcome: 'send', attempts: (c.attempts ?? 1) + 1 });
                  triggerStatsRefresh();
                  load();
                },
              } : undefined}
            >
              <ClimbCard
                climb={c}
                compact
                onPress={() => { setEditingClimb(c); setLogModalVisible(true); }}
                onIncrementAttempts={async () => {
                  await saveClimb({ ...c, attempts: (c.attempts ?? 1) + 1 });
                  load();
                }}
              />
            </SwipeToDelete>
          ))
        )}

        {/* Notes */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <View style={styles.metaLabelRow}>
            <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
            {activeEditingNotes ? (
              <TouchableOpacity
                onPress={() => {
                  const t = activeNotesInputValue.current;
                  setActiveNotes(t);
                  setActiveEditingNotes(false);
                  handleSaveActiveSessionMeta(activeSession.sessionId, t, activeFriends, activeLocation, activeMediaItems);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.metaAction, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => { activeNotesInputValue.current = activeNotes; setActiveEditingNotes(true); }} activeOpacity={0.7}>
                <Text style={[styles.metaAction, { color: colors.accent }]}>
                  {activeNotes.trim() ? 'Edit Activity Note' : 'Add Activity Note'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {activeEditingNotes ? (
            <TextInput
              key={activeSession.sessionId}
              style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border }]}
              defaultValue={activeNotes}
              onChangeText={(t) => { activeNotesInputValue.current = t; }}
              onEndEditing={(e) => {
                const t = e.nativeEvent.text;
                setActiveNotes(t);
                setActiveEditingNotes(false);
                handleSaveActiveSessionMeta(activeSession.sessionId, t, activeFriends, activeLocation, activeMediaItems);
              }}
              placeholder="Add session notes…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus
            />
          ) : activeNotes.trim() ? (
            <Text style={[styles.notesText, { color: colors.textSecondary }]}>{activeNotes}</Text>
          ) : null}
        </View>

        {/* Location */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
          <View style={{ marginBottom: -SPACING.md }}>
            <LocationPicker
              value={activeLocation}
              onChange={(loc) => {
                setActiveLocation(loc);
                handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, loc, activeMediaItems);
              }}
            />
          </View>
        </View>

        {/* Climbing With */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
          <SessionFriendPicker
            initialFriends={activeFriends}
            onSave={(names) => {
              setActiveFriends(names);
              handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, names, activeLocation, activeMediaItems);
            }}
          />
        </View>

        {/* Media */}
        <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
          {allActiveMedia.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
              {allActiveMedia.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => { setViewerUris(allActiveMedia.map(m => m.uri)); setViewerIndex(idx); setViewerVisible(true); }}
                  onLongPress={() => item.fromClimb ? handleRemoveClimbMediaItem(item.climbId, item.uri) : handleRemoveActiveSessionMediaItem(item.sessionIndex, activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
                  activeOpacity={0.9}
                  delayLongPress={400}
                  style={{ marginRight: SPACING.sm }}
                >
                  <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.mediaThumbnail, styles.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bg }]}
                onPress={() => handlePickActiveSessionMedia(activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <TouchableOpacity
              style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
              onPress={() => handlePickActiveSessionMedia(activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
              activeOpacity={0.7}
            >
              <Text style={[styles.mediaBtnText, { color: colors.textSecondary }]}>+ Add Photo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={styles.detailActions}>
          <TouchableOpacity
            style={[styles.logClimbBtn, { backgroundColor: colors.accent, flex: 1 }]}
            onPress={async () => {
              if (activeSessionId) {
                await endSession(activeSessionId);
                const sessions = await import('../utils/storage').then(m => m.getAllSessions());
                const ended = sessions.find(s => s.id === activeSessionId);
                if (ended && user) syncSessionToCloud(ended, user.id).catch(() => {});
              }
              await load();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.logClimbBtnText}>End Session</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => setShareDay(activeSession)}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => setChangeDateSession(activeSession)}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Edit Date</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
```

with:

```tsx
    return (
      <>
        {/* Compact card — tap to open the full editable view */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.accent, borderWidth: 2, gap: SPACING.md, marginBottom: SPACING.md }]}
          onPress={() => setActiveSessionModalVisible(true)}
        >
          <View style={styles.activeBadgeRow}>
            <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.detailDay, { color: colors.accent }]}>ACTIVE SESSION</Text>
          </View>
          <Text style={[styles.detailTitle, { color: colors.textPrimary }]}>
            {activeTitle.trim() || sessionTimeOfDay(activeSession)}
          </Text>
          <View style={[styles.detailStatsRow, { borderTopColor: colors.border }]}>
            {projecting ? (
              <Text style={[styles.todayStatLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
            ) : (
              <>
                <View style={styles.todayStat}>
                  <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{gradedCount}</Text>
                  <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>climbs</Text>
                </View>
                <View style={styles.todayStat}>
                  <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{sends}</Text>
                  <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>sends</Text>
                </View>
              </>
            )}
            {hardest && (
              <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
                <Text style={[styles.hardestText, { color: hardestTypeColor }]}>{hardest.grade}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Full editable view */}
        <Modal
          visible={activeSessionModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setActiveSessionModalVisible(false)}
        >
          <View style={[styles.detailContainer, { backgroundColor: colors.bg }]}>
            <View style={[styles.detailTopBar, { borderBottomColor: colors.border, justifyContent: 'flex-end' }]}>
              <TouchableOpacity onPress={() => setActiveSessionModalVisible(false)} style={styles.backBtn} activeOpacity={0.7}>
                <Text style={[styles.backBtnText, { color: colors.accent }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.detailContent}>
              <View style={[styles.metaCard, { backgroundColor: colors.bgCard, borderColor: colors.accent, borderWidth: 2, gap: SPACING.md, marginBottom: SPACING.md }]}>
                {/* Active badge */}
                <View style={styles.activeBadgeRow}>
                  <View style={[styles.activeDot, { backgroundColor: colors.accent }]} />
                  <Text style={[styles.detailDay, { color: colors.accent }]}>ACTIVE SESSION</Text>
                </View>

                {/* Editable title */}
                {activeEditingTitle ? (
                  <TextInput
                    style={[styles.detailTitle, styles.detailTitleInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    defaultValue={activeTitle || sessionTimeOfDay(activeSession)}
                    onChangeText={t => { activeTitleInputValue.current = t; }}
                    onEndEditing={e => {
                      const t = e.nativeEvent.text.trim();
                      setActiveTitle(t);
                      setActiveEditingTitle(false);
                      handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, activeLocation, activeMediaItems, t);
                    }}
                    onSubmitEditing={e => {
                      const t = e.nativeEvent.text.trim();
                      setActiveTitle(t);
                      setActiveEditingTitle(false);
                      handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, activeLocation, activeMediaItems, t);
                    }}
                    placeholder={sessionTimeOfDay(activeSession)}
                    placeholderTextColor={colors.textMuted}
                    autoFocus
                    selectTextOnFocus
                    returnKeyType="done"
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.detailTitleRow}
                    onPress={() => { activeTitleInputValue.current = activeTitle; setActiveEditingTitle(true); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.detailTitle, { color: colors.textPrimary, flex: 1 }]}>
                      {activeTitle.trim() || sessionTimeOfDay(activeSession)}
                    </Text>
                    <Ionicons name="pencil-outline" size={16} color={colors.textMuted} style={{ marginLeft: 6, marginTop: 3 }} />
                  </TouchableOpacity>
                )}

                {/* Stats row */}
                <View style={[styles.detailStatsRow, { borderTopColor: colors.border }]}>
                  {projecting ? (
                    <Text style={[styles.todayStatLbl, { color: colors.accent, fontFamily: FONTS.family.semibold, fontSize: FONTS.sizes.md }]}>Projecting</Text>
                  ) : (
                    <>
                      <View style={styles.todayStat}>
                        <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{gradedCount}</Text>
                        <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>climbs</Text>
                      </View>
                      <View style={styles.todayStat}>
                        <Text style={[styles.todayStatVal, { color: colors.textPrimary }]}>{sends}</Text>
                        <Text style={[styles.todayStatLbl, { color: colors.textMuted }]}>sends</Text>
                      </View>
                    </>
                  )}
                  {hardest && (
                    <View style={[styles.hardestBadge, { backgroundColor: hardestTypeColor + '25', borderColor: hardestTypeColor }]}>
                      <Text style={[styles.hardestText, { color: hardestTypeColor }]}>{hardest.grade}</Text>
                    </View>
                  )}
                </View>

                {/* Climbs */}
                {activeSession.climbs.length === 0 ? (
                  <Text style={[styles.noClimbs, { color: colors.textMuted }]}>No climbs logged yet</Text>
                ) : (
                  activeSession.climbs.map(c => (
                    <SwipeToDelete
                      key={c.id}
                      onSwipeStart={() => setListScrollEnabled(false)}
                      onSwipeEnd={() => setListScrollEnabled(true)}
                      onDelete={async () => { await deleteClimb(c.id); triggerStatsRefresh(); load(); }}
                      rightAction={c.outcome === 'attempt' ? {
                        label: 'Send',
                        color: colors.accentGreen,
                        onPress: async () => {
                          await saveClimb({ ...c, outcome: 'send', attempts: (c.attempts ?? 1) + 1 });
                          triggerStatsRefresh();
                          load();
                        },
                      } : undefined}
                    >
                      <ClimbCard
                        climb={c}
                        compact
                        onPress={() => { setEditingClimb(c); setLogModalVisible(true); }}
                        onIncrementAttempts={async () => {
                          await saveClimb({ ...c, attempts: (c.attempts ?? 1) + 1 });
                          load();
                        }}
                      />
                    </SwipeToDelete>
                  ))
                )}

                {/* Notes */}
                <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <View style={styles.metaLabelRow}>
                    <Text style={[styles.metaLabel, { color: colors.textMuted }]}>NOTES</Text>
                    {activeEditingNotes ? (
                      <TouchableOpacity
                        onPress={() => {
                          const t = activeNotesInputValue.current;
                          setActiveNotes(t);
                          setActiveEditingNotes(false);
                          handleSaveActiveSessionMeta(activeSession.sessionId, t, activeFriends, activeLocation, activeMediaItems);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.metaAction, { color: colors.accent, fontFamily: FONTS.family.semibold }]}>Done</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={() => { activeNotesInputValue.current = activeNotes; setActiveEditingNotes(true); }} activeOpacity={0.7}>
                        <Text style={[styles.metaAction, { color: colors.accent }]}>
                          {activeNotes.trim() ? 'Edit Activity Note' : 'Add Activity Note'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {activeEditingNotes ? (
                    <TextInput
                      key={activeSession.sessionId}
                      style={[styles.notesInput, { color: colors.textPrimary, borderColor: colors.border }]}
                      defaultValue={activeNotes}
                      onChangeText={(t) => { activeNotesInputValue.current = t; }}
                      onEndEditing={(e) => {
                        const t = e.nativeEvent.text;
                        setActiveNotes(t);
                        setActiveEditingNotes(false);
                        handleSaveActiveSessionMeta(activeSession.sessionId, t, activeFriends, activeLocation, activeMediaItems);
                      }}
                      placeholder="Add session notes…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      autoFocus
                    />
                  ) : activeNotes.trim() ? (
                    <Text style={[styles.notesText, { color: colors.textSecondary }]}>{activeNotes}</Text>
                  ) : null}
                </View>

                {/* Location */}
                <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>LOCATION</Text>
                  <View style={{ marginBottom: -SPACING.md }}>
                    <LocationPicker
                      value={activeLocation}
                      onChange={(loc) => {
                        setActiveLocation(loc);
                        handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, activeFriends, loc, activeMediaItems);
                      }}
                    />
                  </View>
                </View>

                {/* Climbing With */}
                <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>CLIMBING WITH</Text>
                  <SessionFriendPicker
                    initialFriends={activeFriends}
                    onSave={(names) => {
                      setActiveFriends(names);
                      handleSaveActiveSessionMeta(activeSession.sessionId, activeNotes, names, activeLocation, activeMediaItems);
                    }}
                  />
                </View>

                {/* Media */}
                <View style={[styles.metaCard, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Text style={[styles.metaLabel, { color: colors.textMuted }]}>MEDIA</Text>
                  {allActiveMedia.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
                      {allActiveMedia.map((item, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => { setViewerUris(allActiveMedia.map(m => m.uri)); setViewerIndex(idx); setViewerVisible(true); }}
                          onLongPress={() => item.fromClimb ? handleRemoveClimbMediaItem(item.climbId, item.uri) : handleRemoveActiveSessionMediaItem(item.sessionIndex, activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
                          activeOpacity={0.9}
                          delayLongPress={400}
                          style={{ marginRight: SPACING.sm }}
                        >
                          <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} resizeMode="cover" />
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.mediaThumbnail, styles.mediaAddTile, { borderColor: colors.border, backgroundColor: colors.bg }]}
                        onPress={() => handlePickActiveSessionMedia(activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 30, color: colors.textMuted }}>+</Text>
                      </TouchableOpacity>
                    </ScrollView>
                  ) : (
                    <TouchableOpacity
                      style={[styles.mediaBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                      onPress={() => handlePickActiveSessionMedia(activeSession.sessionId, activeMediaItems, setActiveMediaItems, activeNotes, activeFriends, activeLocation)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.mediaBtnText, { color: colors.textSecondary }]}>+ Add Photo</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.detailActions}>
                  <TouchableOpacity
                    style={[styles.logClimbBtn, { backgroundColor: colors.accent, flex: 1 }]}
                    onPress={async () => {
                      setActiveSessionModalVisible(false);
                      if (activeSessionId) {
                        await endSession(activeSessionId);
                        const sessions = await import('../utils/storage').then(m => m.getAllSessions());
                        const ended = sessions.find(s => s.id === activeSessionId);
                        if (ended && user) syncSessionToCloud(ended, user.id).catch(() => {});
                      }
                      await load();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.logClimbBtnText}>End Session</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    onPress={() => setShareDay(activeSession)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    onPress={() => setChangeDateSession(activeSession)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Edit Date</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </>
    );
  }
```

Note the one deliberate behavior addition: `setActiveSessionModalVisible(false);` was added as the first line of the "End Session" handler, so the modal dismisses cleanly before the session ends and the card disappears from the list (matching the existing pattern in `SessionEditModalContent`'s "Delete Session" handler, which closes its own modal before reloading).

Everything else — every prop, every handler, every style reference — is copied verbatim from the current code. No new styles are introduced; the compact card reuses `metaCard`/`activeBadgeRow`/`activeDot`/`detailDay`/`detailTitle`/`detailStatsRow`/`todayStat`/`todayStatVal`/`todayStatLbl`/`hardestBadge`/`hardestText`, all already defined and used elsewhere in this same file.

- [ ] **Step 3: Type-check**

Run `npx tsc --noEmit`. Confirm no new errors versus the current baseline (25 total `error TS` lines across the repo).

- [ ] **Step 4: Commit**

```bash
git add app/sessions.tsx
git commit -m "Show a compact tappable card for the active session, move editing into a modal"
```

---

### Task 2: Manual verification

**Files:** none (verification only)

This is a native Expo app — verification must happen in a simulator or on a physical device, not a browser preview.

- [ ] **Step 1: Start (or resume) an active session.** Confirm it now shows as a compact card at the top of the Sessions tab — "ACTIVE SESSION" badge, title, and a climbs/sends/hardest stats row — with no inline-editable fields visible in the list.

- [ ] **Step 2: Tap the compact card.** Confirm it opens a full-screen modal with everything that used to be inline: editable title (tap to rename), stats, the climbs list (tap a climb to open its detail, swipe to delete, swipe-right-to-send for attempts), Notes, Location, Climbing With, Media (add/remove/view), and the End Session / Share / Edit Date buttons.

- [ ] **Step 3: Edit a few fields inside the modal** (title, notes, location, add a friend, add a photo). Confirm each saves correctly, exactly as it did when this was inline before.

- [ ] **Step 4: Tap "Done".** Confirm the modal closes and the compact card at the top reflects the updated title/stats.

- [ ] **Step 5: Log a new climb** (via the main "+" tab or FAB, whichever the app uses) while the active session's compact card is showing. Confirm the compact card's stats update to reflect the new climb without needing to open the modal.

- [ ] **Step 6: Tap "End Session" inside the modal.** Confirm the modal closes, the session moves out of "active" status, and it now appears as a normal closed session card further down the list (or wherever session-card ordering places it).

- [ ] **Step 7: Confirm closed session cards, the condensed/expanded toggle, and everything else on the Sessions tab are completely unaffected** by this change.

- [ ] **Step 8: Report results.** Do not check this task off as complete until actually exercised in a simulator/device.
