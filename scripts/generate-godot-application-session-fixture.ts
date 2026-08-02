import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, canonicalSha256 } from '../src/core/migration/canonicalJson';
import { governCity } from '../src/core/cityCommands';
import {
  createProductionSessionState,
  OracleApplicationSession,
  type ApplicationCommandEnvelope,
} from '../src/core/migration/applicationSessionContract';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'godot/data/fixtures/application-session-suite-v1.json');
const writeMode = process.argv.includes('--write');
const fixture = buildFixture();

if (writeMode) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  process.stdout.write(`[Godot application session] generated ${transactionCaseCount(fixture)} transaction cases\n`);
} else {
  let current: unknown;
  try { current = JSON.parse(readFileSync(path, 'utf8')); } catch { current = null; }
  if (canonicalJson(current) !== canonicalJson(fixture)) {
    throw new Error('godot/data/fixtures/application-session-suite-v1.json differs from TypeScript oracle');
  }
  process.stdout.write(`[Godot application session] PASSED ${transactionCaseCount(fixture)} transaction cases\n`);
}

function transactionCaseCount(value: ReturnType<typeof buildFixture>) {
  return value.steps.length + value.internalAffairsSequence.steps.length
    + value.internalAffairsBoundaryCases.length + value.officerManagementSequence.steps.length
    + value.officerManagementBoundaryCases.length + value.personnelLifecycleSequence.steps.length
    + value.personnelLifecycleBoundaryCases.length + value.strategicLogisticsSequences
      .reduce((total, sequence) => total + sequence.steps.length, 0)
    + value.strategicLogisticsBoundaryCases.length + value.validationCases.length;
}

export function buildFixture() {
  const initialState = createProductionSessionState(1, 1);
  const initialDigest = canonicalSha256(initialState);
  const session = new OracleApplicationSession(initialState);
  const success: ApplicationCommandEnvelope = {
    commandEnvelopeVersion: 1,
    commandId: 'mb04-develop-0001',
    expectedStateSha256: initialDigest,
    kind: 'develop_farming',
    parameters: { cityId: 'city-12', officerId: 'officer-1' },
  };
  const steps: { id: string; command: unknown; expected: unknown }[] = [];
  const apply = (id: string, command: unknown) => steps.push({ id, command, expected: session.execute(command) });
  const firstResult = session.execute(success);
  steps.push({ id: 'success', command: success, expected: firstResult });
  apply('exact-duplicate', success);
  apply('stale-before-digest', { ...success, commandId: 'mb04-stale-0002' });
  apply('domain-rejection', {
    ...success,
    commandId: 'mb04-domain-0003',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  apply('command-id-conflict', {
    ...success,
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 'city-12', officerId: 'officer-21' },
  });
  apply('unknown-command', {
    ...success,
    commandId: 'mb04-unknown-0004',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    kind: 'unknown',
    parameters: {},
  });
  apply('unsupported-version', {
    ...success,
    commandEnvelopeVersion: 2,
    commandId: 'mb04-version-0005',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  apply('missing-parameter', {
    ...success,
    commandId: 'mb04-missing-0006',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 'city-12' },
  });
  apply('sorted-unknown-field-error', {
    ...success,
    commandId: 'mb04-fields-0007',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    ['\u{10000}']: true,
    ['\ue000']: true,
  });
  apply('wrong-parameter-type', {
    ...success,
    commandId: 'mb04-invalid-0008',
    expectedStateSha256: canonicalSha256(session.snapshot()),
    parameters: { cityId: 12, officerId: 'officer-1' },
  });
  apply('non-breaking-space-command-id', {
    ...success,
    commandId: '\u00a0',
    expectedStateSha256: canonicalSha256(session.snapshot()),
  });
  const restoredSession = new OracleApplicationSession(firstResult.state);
  const continuationCommand: ApplicationCommandEnvelope = {
    commandEnvelopeVersion: 1,
    commandId: 'mb04-restored-0009',
    expectedStateSha256: canonicalSha256(restoredSession.snapshot()),
    kind: 'develop_farming',
    parameters: { cityId: 'city-12', officerId: 'officer-32' },
  };
  const continuationExpected = restoredSession.execute(continuationCommand);
  apply('second-success', continuationCommand);
  apply('advanced-duplicate', success);
  const internalAffairsSequence = buildInternalAffairsSequence();
  return {
    applicationSessionFixtureVersion: 1,
    algorithms: {
      canonicalJson: 'canonical-json-v1',
      digest: 'sha256',
      numberDomain: 'safe-integer-or-decimal-6-v1',
    },
    campaign: { periodId: 1, rulerSourceIndex: 1, initialStateSha256: initialDigest },
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
    restoredContinuation: {
      command: continuationCommand,
      expected: continuationExpected,
    },
    internalAffairsSequence,
    internalAffairsBoundaryCases: buildInternalAffairsBoundaryCases(),
    officerManagementSequence: buildOfficerManagementSequence(),
    officerManagementBoundaryCases: buildOfficerManagementBoundaryCases(),
    personnelLifecycleSequence: buildPersonnelLifecycleSequence(),
    personnelLifecycleBoundaryCases: buildPersonnelLifecycleBoundaryCases(),
    strategicLogisticsSequences: buildStrategicLogisticsSequences(),
    strategicLogisticsBoundaryCases: buildStrategicLogisticsBoundaryCases(),
    validationCases: buildValidationCases(),
    modernRulesetCase: buildModernRulesetCase(),
  };
}

function buildStrategicLogisticsSequences() {
  const build = (
    id: string,
    seed: number,
    transportOnly = false,
    advancePatches: StatePatch[] = [],
  ) => {
    const initialState = createProductionSessionState(1, 5);
    const initialPatches: StatePatch[] = [
      { path: ['rngSeed'], value: seed },
      { path: ['cities', 'city-0', 'reserveTroops'], value: 500 },
    ];
    applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
    const session = new OracleApplicationSession(initialState);
    const steps: Array<{ id: string; operation: 'command' | 'advance'; command?: ApplicationCommandEnvelope; expectedCore: unknown }> = [];
    let serial = 1;
    const command = (stepId: string, kind: string, parameters: Record<string, unknown>) => {
      const envelope: ApplicationCommandEnvelope = {
        commandEnvelopeVersion: 1,
        commandId: `mb08-${id}-${String(serial).padStart(3, '0')}`,
        expectedStateSha256: canonicalSha256(session.snapshot()),
        kind,
        parameters,
      };
      serial += 1;
      const { state: _stateEvidence, ...expectedCore } = session.execute(envelope);
      steps.push({ id: stepId, operation: 'command', command: envelope, expectedCore });
    };
    const advance = (stepId: string, prePatches: StatePatch[] = []) => {
      let preStateSha256 = canonicalSha256(session.snapshot());
      if (prePatches.length > 0) {
        const patched = session.snapshot();
        applyStatePatches(patched as unknown as Record<string, unknown>, prePatches);
        session.restoreSnapshot(patched);
        preStateSha256 = canonicalSha256(patched);
      }
      const { state: _stateEvidence, ...expectedCore } = session.advanceStrategicOrders();
      steps.push({ id: stepId, operation: 'advance', prePatches, preStateSha256, expectedCore } as typeof steps[number]);
    };
    if (!transportOnly) {
      command('issue-multihop-move', 'issue_move_order', {
        sourceCityId: 'city-0', targetCityId: 'city-8', officerId: 'officer-56',
      });
      advance('move-month-1');
      advance('move-arrival');
    }
    command(transportOnly ? 'issue-loss-transport' : 'issue-success-transport', 'issue_transport_order', {
      sourceCityId: 'city-0', targetCityId: 'city-3', officerId: transportOnly ? 'officer-56' : 'officer-57',
      cargo: { money: 10, food: 20, reserveTroops: 30 },
    });
    advance(transportOnly ? `transport-${id}` : 'transport-success', advancePatches);
    return {
      id,
      campaign: { periodId: 1, rulerSourceIndex: 5 },
      initialPatches,
      initialStateSha256: canonicalSha256(initialState),
      steps,
      finalStateSha256: canonicalSha256(session.snapshot()),
    };
  };
  const targetCapturedPatches: StatePatch[] = [
    { path: ['cities', 'city-3', 'ownerId'], value: 'ruler-0' },
    { path: ['cities', 'city-3', 'satrapOfficerId'], value: 'officer-19' },
    { path: ['officers', 'officer-19', 'cityId'], value: 'city-3' },
    { path: ['officers', 'officer-64', 'cityId'], value: 'city-8' },
  ];
  const buildMultiOrder = () => {
    const initialState = createProductionSessionState(1, 5);
    const initialPatches: StatePatch[] = [{ path: ['cities', 'city-8', 'reserveTroops'], value: 500 }];
    applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
    const session = new OracleApplicationSession(initialState);
    const steps: Array<{ id: string; operation: 'command' | 'advance'; command?: ApplicationCommandEnvelope; expectedCore: unknown }> = [];
    for (const [index, officerId, cargo] of [
      [1, 'officer-58', { money: 11, food: 21, reserveTroops: 31 }],
      [2, 'officer-60', { money: 12, food: 22, reserveTroops: 32 }],
    ] as const) {
      const command: ApplicationCommandEnvelope = {
        commandEnvelopeVersion: 1,
        commandId: `mb08-multi-${index}`,
        expectedStateSha256: canonicalSha256(session.snapshot()),
        kind: 'issue_transport_order',
        parameters: { sourceCityId: 'city-8', targetCityId: 'city-3', officerId, cargo },
      };
      const { state: _stateEvidence, ...expectedCore } = session.execute(command);
      steps.push({ id: `issue-transport-${index}`, operation: 'command', command, expectedCore });
    }
    // Rename the two valid orders to 2 and 10 so the fixture distinguishes the
    // constrained-ASCII ordinal contract (10 before 2) from numeric sorting.
    const beforeAdvance = session.snapshot();
    const firstOrder = { ...beforeAdvance.strategicOrders['strategic-order-1'], id: 'strategic-order-2' };
    const secondOrder = { ...beforeAdvance.strategicOrders['strategic-order-2'], id: 'strategic-order-10' };
    const prePatches: StatePatch[] = [
      { path: ['strategicOrders'], value: { 'strategic-order-2': firstOrder, 'strategic-order-10': secondOrder } },
      { path: ['nextStrategicOrderSerial'], value: 11 },
    ];
    applyStatePatches(beforeAdvance as unknown as Record<string, unknown>, prePatches);
    session.restoreSnapshot(beforeAdvance);
    const preStateSha256 = canonicalSha256(beforeAdvance);
    const { state: _stateEvidence, ...expectedCore } = session.advanceStrategicOrders();
    steps.push({ id: 'advance-stable-order-ids', operation: 'advance', prePatches, preStateSha256, expectedCore } as typeof steps[number]);
    return {
      id: 'multi-order', campaign: { periodId: 1, rulerSourceIndex: 5 },
      initialPatches, initialStateSha256: canonicalSha256(initialState), steps,
      finalStateSha256: canonicalSha256(session.snapshot()),
    };
  };
  return [
    build('success', 48_641),
    build('loss', 1_972, true),
    build('target-full', 48_641, true, [{ path: ['cities', 'city-3', 'money'], value: Number.MAX_SAFE_INTEGER }]),
    build('target-captured', 48_641, true, targetCapturedPatches),
    buildMultiOrder(),
  ];
}

function buildStrategicLogisticsBoundaryCases() {
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[] = [],
  ) => {
    const input = createProductionSessionState(1, 5);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb08-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, campaign: { periodId: 1, rulerSourceIndex: 5 }, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  const directRoute: StatePatch[] = [
    { path: ['cities', 'city-0', 'reserveTroops'], value: 100 },
  ];
  add('non-owned-target', 'issue_move_order', {
    sourceCityId: 'city-0', targetCityId: 'city-9', officerId: 'officer-56',
  });
  add('negative-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: -1, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('fractional-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 0.5, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('empty-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 0, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('insufficient-cargo', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 203, food: 0, reserveTroops: 0 },
  }, directRoute);
  add('extra-cargo-field', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 1, food: 0, reserveTroops: 0, gems: 1 },
  }, directRoute);
  add('target-safe-integer-overflow', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 1, food: 0, reserveTroops: 0 },
  }, [...directRoute, { path: ['cities', 'city-3', 'money'], value: Number.MAX_SAFE_INTEGER }]);
  add('acted-officer', 'issue_move_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
  }, [...directRoute, { path: ['actedOfficerIds'], value: ['officer-56'] }]);
  add('stamina-insufficient', 'issue_transport_order', {
    sourceCityId: 'city-0', targetCityId: 'city-3', officerId: 'officer-56',
    cargo: { money: 1, food: 0, reserveTroops: 0 },
  }, [...directRoute, { path: ['officers', 'officer-56', 'stamina'], value: 7 }]);
  return cases;
}

function buildPersonnelLifecycleSequence() {
  const initialState = createProductionSessionState(1, 1);
  const initialPatches: StatePatch[] = [
    { path: ['discoveredOfficerIds'], value: ['officer-126'] },
    ...captivePatches('officer-30', 0),
    { path: ['officers', 'officer-33', 'intelligence'], value: 255 },
  ];
  applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
  const session = new OracleApplicationSession(initialState);
  const steps: { id: string; command: ApplicationCommandEnvelope; expectedCore: unknown }[] = [];
  let serial = 1;
  const apply = (id: string, kind: string, parameters: Record<string, unknown>) => {
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb07-${String(serial).padStart(4, '0')}`,
      expectedStateSha256: canonicalSha256(session.snapshot()),
      kind,
      parameters,
    };
    serial += 1;
    const { state: _stateEvidence, ...expectedCore } = session.execute(command);
    steps.push({ id, command, expectedCore });
  };
  apply('explicit-recruit-attempt', 'recruit_free_officer', {
    cityId: 'city-12', executorOfficerId: 'officer-1', targetOfficerId: 'officer-126',
  });
  apply('search-real-city', 'search_city', { cityId: 'city-12', officerId: 'officer-32' });
  apply('captive-surrender-success', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-33', captiveOfficerId: 'officer-30',
  });
  apply('banish-recruited-captive', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-30',
  });
  return {
    initialPatches,
    initialStateSha256: canonicalSha256(initialState),
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
  };
}

function buildPersonnelLifecycleBoundaryCases() {
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[],
  ) => {
    const input = createProductionSessionState(1, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb07-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  add('search-direct-recruit-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 43 }]);
  add('search-hidden-item-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 42 }]);
  add('search-no-result-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 1 }]);
  add('search-food-branch', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [{ path: ['rngSeed'], value: 1327 }]);
  add('search-discovery-recruit-failure', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [
    { path: ['rngSeed'], value: 53 },
    { path: ['officers', 'officer-1', 'intelligence'], value: 20 },
  ]);
  add('search-money-soft-cap', 'search_city', {
    cityId: 'city-12', officerId: 'officer-1',
  }, [
    { path: ['rngSeed'], value: 682 },
    { path: ['cities', 'city-12', 'money'], value: 30_000 },
  ]);
  add('explicit-recruit-failure', 'recruit_free_officer', {
    cityId: 'city-12', executorOfficerId: 'officer-1', targetOfficerId: 'officer-126',
  }, [
    { path: ['discoveredOfficerIds'], value: ['officer-126'] },
    { path: ['officers', 'officer-1', 'intelligence'], value: 0 },
    { path: ['rngSeed'], value: 1 },
  ]);
  add('surrender-intelligence-gate-failure', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 50),
    { path: ['officers', 'officer-32', 'intelligence'], value: 0 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 255 },
  ]);
  add('surrender-high-loyalty-reduction', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 90),
    { path: ['officers', 'officer-32', 'intelligence'], value: 255 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 0 },
  ]);
  add('surrender-effective-intelligence-equipment-flip', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 90),
    { path: ['rngSeed'], value: 707 },
    { path: ['officers', 'officer-32', 'intelligence'], value: 50 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 50 },
    { path: ['officers', 'officer-4', 'equipmentItemIds'], value: ['item-10'] },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-13'] },
  ]);
  add('surrender-character-resistance-two-draw-failure', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 60),
    { path: ['rngSeed'], value: 1 },
    { path: ['officers', 'officer-32', 'intelligence'], value: 255 },
    { path: ['officers', 'officer-30', 'intelligence'], value: 0 },
    { path: ['officers', 'officer-30', 'character'], value: 4 },
  ]);
  add('modern-surrender-cost', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
  }, [
    ...captivePatches('officer-30', 0),
    { path: ['rulesetId'], value: 'modern-balanced-v1' },
    { path: ['officers', 'officer-32', 'intelligence'], value: 255 },
  ]);
  add('release-captive', 'release_captive', {
    cityId: 'city-12', captiveOfficerId: 'officer-30',
  }, captivePatches('officer-30', 50));
  add('execute-equipped-captive', 'execute_captive', {
    cityId: 'city-12', captiveOfficerId: 'officer-20',
  }, captivePatches('officer-20', 95));
  add('banish-captive-stable-destination', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-30',
  }, [...captivePatches('officer-30', 35), { path: ['rngSeed'], value: 1 }]);
  add('banish-manual-satrap-repairs-city', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-32',
  }, [
    { path: ['rulesetId'], value: 'modern-balanced-v1' },
    { path: ['cities', 'city-12', 'satrapOfficerId'], value: 'officer-32' },
    { path: ['rngSeed'], value: 1 },
  ]);
  add('confiscate-non-ruler-equipment', 'confiscate_equipment', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-16',
  }, equipmentPatches('officer-34', 'item-16'));
  add('confiscate-player-ruler-preserves-seed', 'confiscate_equipment', {
    cityId: 'city-12', officerId: 'officer-1', itemId: 'item-16',
  }, equipmentPatches('officer-1', 'item-16'));
  add('ruler-banish-rejected', 'banish_officer', {
    cityId: 'city-12', officerId: 'officer-1',
  }, []);
  add('sorted-personnel-parameter-error', 'recruit_captive', {
    cityId: 'city-12', executorOfficerId: 'officer-32', captiveOfficerId: 'officer-30',
    ['\u{10000}']: true, ['\ue000']: true,
  }, []);
  add('missing-captive-precedes-blank-city', 'recruit_captive', {
    cityId: '', executorOfficerId: 'officer-32',
  }, []);
  return cases;
}

function captivePatches(officerId: string, loyalty: number): StatePatch[] {
  const initial = createProductionSessionState(1, 1).officers[officerId];
  return [
    { path: ['officers', officerId, 'status'], value: 'captive' },
    { path: ['officers', officerId, 'factionId'], value: 'neutral' },
    { path: ['officers', officerId, 'cityId'], value: 'city-12' },
    { path: ['officers', officerId, 'captorFactionId'], value: 'ruler-1' },
    { path: ['officers', officerId, 'formerFactionId'], value: initial.factionId },
    { path: ['officers', officerId, 'loyalty'], value: loyalty },
    { path: ['officers', officerId, 'troops'], value: 0 },
    { path: ['officers', officerId, 'stamina'], value: 0 },
  ];
}

function equipmentPatches(officerId: string, itemId: string): StatePatch[] {
  const state = createProductionSessionState(1, 1);
  return [
    {
      path: ['cities', 'city-12', 'hiddenItemIds'],
      value: (state.cities['city-12'].hiddenItemIds ?? []).filter((candidate) => candidate !== itemId),
    },
    { path: ['officers', officerId, 'equipmentItemIds'], value: [itemId] },
  ];
}

function buildOfficerManagementSequence() {
  const initialState = createProductionSessionState(1, 1);
  const initialPatches: StatePatch[] = [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-16', 'item-32'] },
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: ['item-20'] },
    { path: ['cities', 'city-2', 'hiddenItemIds'], value: [] },
  ];
  applyStatePatches(initialState as unknown as Record<string, unknown>, initialPatches);
  const session = new OracleApplicationSession(initialState);
  const steps: { id: string; command: ApplicationCommandEnvelope; expectedCore: unknown }[] = [];
  let serial = 1;
  const apply = (id: string, kind: string, parameters: Record<string, unknown>) => {
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb06-${String(serial).padStart(4, '0')}`,
      expectedStateSha256: canonicalSha256(session.snapshot()),
      kind,
      parameters,
    };
    serial += 1;
    const { state: _stateEvidence, ...expectedCore } = session.execute(command);
    steps.push({ id, command, expectedCore });
  };
  apply('reward-success', 'reward_officer', { cityId: 'city-12', officerId: 'officer-34' });
  apply('give-normal-item-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-16',
  });
  apply('unequip-success', 'unequip_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-16',
  });
  apply('give-arms-token-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-36', itemId: 'item-32',
  });
  apply('classic-appointment-rejected', 'appoint_satrap', {
    cityId: 'city-12', officerId: 'officer-32',
  });
  apply('ruler-reward-rejected', 'reward_officer', {
    cityId: 'city-12', officerId: 'officer-1',
  });
  return {
    initialPatches,
    initialStateSha256: canonicalSha256(initialState),
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
  };
}

function buildOfficerManagementBoundaryCases() {
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[],
  ) => {
    const input = createProductionSessionState(1, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb06-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  add('modern-appointment-success', 'appoint_satrap', {
    cityId: 'city-12', officerId: 'officer-32',
  }, [{ path: ['rulesetId'], value: 'modern-balanced-v1' }]);
  add('reward-loyalty-cap', 'reward_officer', {
    cityId: 'city-12', officerId: 'officer-34',
  }, [{ path: ['officers', 'officer-34', 'loyalty'], value: 97 }]);
  add('reward-money-rejected-before-officer', 'reward_officer', {
    cityId: 'city-12', officerId: 'unknown-officer',
  }, [{ path: ['cities', 'city-12', 'money'], value: 0 }]);
  add('ruler-give-preserves-loyalty', 'give_item', {
    cityId: 'city-12', officerId: 'officer-1', itemId: 'item-16',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-16'] },
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: ['item-20'] },
  ]);
  add('elite-token-threshold-rejected', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-30',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-30'] },
    { path: ['cities', 'city-9', 'hiddenItemIds'], value: [] },
  ]);
  add('elite-token-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-30',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-30'] },
    { path: ['cities', 'city-9', 'hiddenItemIds'], value: [] },
    { path: ['cities', 'city-16', 'hiddenItemIds'], value: ['item-8', 'item-12'] },
    { path: ['officers', 'officer-32', 'force'], value: 100 },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-7'] },
  ]);
  add('mystic-token-threshold-rejected', 'give_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-31',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-31'] },
    { path: ['cities', 'city-1', 'hiddenItemIds'], value: [] },
  ]);
  add('mystic-token-success', 'give_item', {
    cityId: 'city-12', officerId: 'officer-34', itemId: 'item-31',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-31'] },
    { path: ['cities', 'city-1', 'hiddenItemIds'], value: [] },
    { path: ['cities', 'city-17', 'hiddenItemIds'], value: ['item-15'] },
    { path: ['officers', 'officer-34', 'intelligence'], value: 100 },
    { path: ['officers', 'officer-34', 'equipmentItemIds'], value: ['item-11'] },
  ]);
  add('arms-token-full-slots-rejected', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-32',
  }, [
    { path: ['cities', 'city-12', 'itemIds'], value: ['item-32'] },
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: [] },
    { path: ['cities', 'city-2', 'hiddenItemIds'], value: [] },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-16', 'item-20'] },
  ]);
  add('ordered-unequip-success', 'unequip_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-16',
  }, [
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: [] },
    { path: ['officers', 'officer-32', 'equipmentItemIds'], value: ['item-16', 'item-20'] },
  ]);
  add('unequip-missing-item-rejected', 'unequip_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-16',
  }, []);
  add('sorted-officer-parameter-error', 'give_item', {
    cityId: 'city-12', officerId: 'officer-32', itemId: 'item-16',
    ['\u{10000}']: true, ['\ue000']: true,
  }, []);
  add('missing-item-precedes-blank-city', 'give_item', {
    cityId: '', officerId: 'officer-32',
  }, []);
  return cases;
}

type StatePatch = { path: string[]; value: unknown };

function buildInternalAffairsBoundaryCases() {
  const base = createProductionSessionState(1, 1);
  const city = base.cities['city-12'];
  const hiddenWithoutItem16 = (city.hiddenItemIds ?? []).filter((id) => id !== 'item-16');
  const cases: unknown[] = [];
  let serial = 1;
  const add = (
    id: string,
    kind: string,
    parameters: Record<string, unknown>,
    patches: StatePatch[],
  ) => {
    const input = createProductionSessionState(1, 1);
    applyStatePatches(input as unknown as Record<string, unknown>, patches);
    const session = new OracleApplicationSession(input);
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb05-boundary-${String(serial).padStart(3, '0')}`,
      expectedStateSha256: canonicalSha256(input),
      kind,
      parameters,
    };
    serial += 1;
    const expected = session.execute(command);
    const { state: _stateEvidence, ...expectedCore } = expected;
    cases.push({ id, patches, command, expectedCore, expectedStateSha256: canonicalSha256(expected.state) });
  };
  add('farming-limit-rejected', 'develop_farming', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'farming'], value: city.farmingLimit },
  ]);
  add('commerce-limit-rejected', 'develop_commerce', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'commerce'], value: city.commerceLimit },
  ]);
  add('govern-abnormal-city', 'govern_city', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'condition'], value: 'flood' },
    { path: ['cities', 'city-12', 'disasterPrevention'], value: 100 },
  ]);
  add('inspect-both-limits-rejected', 'inspect_city', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'publicLoyalty'], value: 100 },
    { path: ['cities', 'city-12', 'population'], value: city.populationLimit },
  ]);
  add('commerce-equipped-intelligence', 'develop_commerce', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'hiddenItemIds'], value: hiddenWithoutItem16 },
    { path: ['officers', 'officer-1', 'equipmentItemIds'], value: ['item-16'] },
  ]);
  add('banquet-ruler-full-rejected', 'banquet_officer', { cityId: 'city-12', targetOfficerId: 'officer-1' }, []);
  add('plunder-resource-caps', 'plunder_city', { cityId: 'city-12', officerId: 'officer-1' }, [
    { path: ['cities', 'city-12', 'money'], value: 30_000 },
    { path: ['cities', 'city-12', 'food'], value: 30_000 },
  ]);
  for (const [id, kind, parameters] of [
    ['modern-inspect-cost', 'inspect_city', { cityId: 'city-12', officerId: 'officer-1' }],
    ['modern-trade-cost', 'trade_food', { cityId: 'city-12', officerId: 'officer-1', direction: 'sell', amount: 1 }],
    ['modern-banquet-cost', 'banquet_officer', { cityId: 'city-12', targetOfficerId: 'officer-36' }],
    ['modern-plunder-cost', 'plunder_city', { cityId: 'city-12', officerId: 'officer-1' }],
  ] as const) {
    add(id, kind, parameters, [{ path: ['rulesetId'], value: 'modern-balanced-v1' }]);
  }
  return cases;
}

function buildValidationCases() {
  return [
    {
      id: 'unsafe-city-money',
      patches: [{ path: ['cities', 'city-12', 'money'], value: '9007199254740992' }],
      expectedPath: 'cities.city-12.money',
      expectedMessage: 'must be a non-negative safe integer',
    },
    {
      id: 'captive-former-faction-cannot-be-captor',
      patches: [
        ...captivePatches('officer-30', 35),
        { path: ['officers', 'officer-30', 'formerFactionId'], value: 'ruler-1' },
      ],
      expectedPath: 'officers.officer-30.formerFactionId',
      expectedMessage: 'captive officer cannot be held by their former faction',
    },
    {
      id: 'dead-officer-requires-death-record',
      patches: [
        { path: ['officers', 'officer-30', 'status'], value: 'dead' },
        { path: ['officers', 'officer-30', 'factionId'], value: 'neutral' },
        { path: ['officers', 'officer-30', 'cityId'], value: null },
        { path: ['officers', 'officer-30', 'troops'], value: 0 },
        { path: ['officers', 'officer-30', 'stamina'], value: 0 },
        { path: ['officers', 'officer-30', 'equipmentItemIds'], value: [] },
      ],
      expectedPath: 'officers.officer-30.death',
      expectedMessage: 'dead officer must retain a death record',
    },
  ];
}

function applyStatePatches(target: Record<string, unknown>, patches: StatePatch[]) {
  for (const patch of patches) {
    let cursor: Record<string, unknown> = target;
    for (const segment of patch.path.slice(0, -1)) cursor = cursor[segment] as Record<string, unknown>;
    cursor[patch.path.at(-1)!] = structuredClone(patch.value);
  }
}

function buildModernRulesetCase() {
  const input = createProductionSessionState(1, 1);
  input.rulesetId = 'modern-balanced-v1';
  const parameters = { cityId: 'city-12', officerId: 'officer-1' };
  const expected = governCity(input, parameters);
  return {
    kind: 'govern_city',
    parameters,
    inputStateSha256: canonicalSha256(input),
    expectedStateSha256: canonicalSha256(expected),
    expectedMoneyCost: input.cities['city-12'].money - expected.cities['city-12'].money,
    expectedStaminaCost: input.officers['officer-1'].stamina - expected.officers['officer-1'].stamina,
  };
}

function buildInternalAffairsSequence() {
  const initialState = createProductionSessionState(1, 1);
  const session = new OracleApplicationSession(initialState);
  const steps: { id: string; command: ApplicationCommandEnvelope; expectedCore: unknown }[] = [];
  let serial = 1;
  const apply = (id: string, kind: string, parameters: Record<string, unknown>) => {
    const command: ApplicationCommandEnvelope = {
      commandEnvelopeVersion: 1,
      commandId: `mb05-${String(serial).padStart(4, '0')}`,
      expectedStateSha256: canonicalSha256(session.snapshot()),
      kind,
      parameters,
    };
    serial += 1;
    const { state: _stateEvidence, ...expectedCore } = session.execute(command);
    steps.push({ id, command, expectedCore });
  };
  apply('trade-sell-success', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-1', direction: 'sell', amount: 100,
  });
  apply('farming-success', 'develop_farming', { cityId: 'city-12', officerId: 'officer-32' });
  apply('commerce-success', 'develop_commerce', { cityId: 'city-12', officerId: 'officer-33' });
  apply('govern-success', 'govern_city', { cityId: 'city-12', officerId: 'officer-34' });
  apply('inspect-success', 'inspect_city', { cityId: 'city-12', officerId: 'officer-35' });
  apply('banquet-success', 'banquet_officer', { cityId: 'city-12', targetOfficerId: 'officer-36' });
  apply('plunder-success', 'plunder_city', { cityId: 'city-12', officerId: 'officer-37' });
  apply('trade-buy-resource-rejected', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-36', direction: 'buy', amount: 30000,
  });
  apply('trade-buy-success', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-36', direction: 'buy', amount: 1,
  });
  apply('invalid-trade-amount', 'trade_food', {
    cityId: 'city-12', officerId: 'officer-21', direction: 'buy', amount: 0,
  });
  apply('sorted-internal-parameter-error', 'develop_commerce', {
    cityId: 'city-12', officerId: 'officer-21', ['\u{10000}']: true, ['\ue000']: true,
  });
  apply('acted-officer-rejected', 'develop_commerce', {
    cityId: 'city-12', officerId: 'officer-1',
  });
  return {
    initialStateSha256: canonicalSha256(initialState),
    steps,
    finalStateSha256: canonicalSha256(session.snapshot()),
  };
}
