import { useEffect, useMemo, useState } from 'react';
import type {
  PartnerExpertSnapshotT,
  SessionEvent,
  SkillMeta,
} from '@kodax-space/space-ipc-schema';
import { useAppStore, type UserMessage } from '../../store/appStore.js';
import { usePartnerExpert } from '../extensions/PartnerExpertProvider.js';
import {
  collectPartnerTaskSkillNames,
  partnerTaskCollaborationScopeKey,
  selectPartnerTaskSkillsForScope,
} from './partnerTaskCollaboration.js';

const EMPTY_MESSAGES: readonly UserMessage[] = [];
const EMPTY_EVENTS: readonly SessionEvent[] = [];

interface SkillDiscoveryState {
  readonly scopeKey: string;
  readonly skills: readonly SkillMeta[];
  readonly loading: boolean;
  readonly error: string | null;
}

export function usePartnerTaskCollaboration(): {
  readonly expert: PartnerExpertSnapshotT | null;
  readonly skills: readonly SkillMeta[];
  readonly loading: boolean;
  readonly error: string | null;
} {
  const projectRoot = useAppStore((state) => state.currentProjectPath);
  const sessionId = useAppStore((state) => state.currentSessionId);
  const messages = useAppStore((state) =>
    state.currentSessionId
      ? (state.userMessagesBySession[state.currentSessionId] ?? EMPTY_MESSAGES)
      : EMPTY_MESSAGES,
  );
  const events = useAppStore((state) =>
    state.currentSessionId
      ? (state.eventsBySession[state.currentSessionId] ?? EMPTY_EVENTS)
      : EMPTY_EVENTS,
  );
  const partnerExpert = usePartnerExpert();
  const expert = partnerExpert?.snapshot.state.expert ?? null;
  const scopeKey = partnerTaskCollaborationScopeKey(projectRoot, sessionId);
  const [discovery, setDiscovery] = useState<SkillDiscoveryState>({
    scopeKey: partnerTaskCollaborationScopeKey(null, null),
    skills: [],
    loading: false,
    error: null,
  });
  const installedSkills = selectPartnerTaskSkillsForScope(discovery, scopeKey);
  const scopedDiscovery =
    discovery.scopeKey === scopeKey
      ? discovery
      : { scopeKey, skills: installedSkills, loading: projectRoot !== null, error: null };

  useEffect(() => {
    const bridge = window.kodaxSpace;
    if (!bridge || !projectRoot) {
      setDiscovery({ scopeKey, skills: [], loading: false, error: null });
      return;
    }
    let alive = true;
    setDiscovery({ scopeKey, skills: [], loading: true, error: null });
    void bridge
      .invoke('skill.discover', { projectRoot })
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          setDiscovery({ scopeKey, skills: result.data.skills, loading: false, error: null });
        } else {
          setDiscovery({ scopeKey, skills: [], loading: false, error: result.error.message });
        }
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setDiscovery({
          scopeKey,
          skills: [],
          loading: false,
          error: reason instanceof Error ? reason.message : String(reason),
        });
      });
    return () => {
      alive = false;
    };
  }, [projectRoot, scopeKey]);

  const skills = useMemo(() => {
    const names = collectPartnerTaskSkillNames({
      skills: installedSkills,
      messageTexts: messages.map((message) => message.content),
      events,
      ...(expert?.expert.skillRef && expert.useSkill !== false
        ? { expertSkillName: expert.expert.skillRef }
        : {}),
    });
    const byName = new Map(installedSkills.map((skill) => [skill.name, skill]));
    return names.flatMap((name) => {
      const skill = byName.get(name);
      return skill ? [skill] : [];
    });
  }, [events, expert, installedSkills, messages]);

  return {
    expert,
    skills,
    loading: scopedDiscovery.loading,
    error: scopedDiscovery.error,
  };
}
