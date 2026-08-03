import {
  localizeArmorItemName,
  localizeArmorLayerName,
  localizeMaterial,
} from '../src/lib/game-localization';
import { ZONE_LABELS } from '../src/lib/tool-calculations';

type RawArmorSlot = {
  name?: string;
  nameId?: string;
  class?: number;
  durability?: number;
  material?: string;
  armorMaterial?: string;
  zones?: string[];
  allowedPlates?: string[];
};

type RawItem = {
  id: string;
  name: string;
  types?: string[];
  properties?: {
    class?: number;
    material?: string;
    armorMaterial?: string;
    speedPenalty?: number;
    turnPenalty?: number;
    ergoPenalty?: number;
    bluntThroughput?: number;
    zones?: string[];
    armorSlots?: RawArmorSlot[];
  };
};

type ItemsDocument = { data?: { items?: Record<string, RawItem> } };
type TranslationDocument = { data?: Record<string, string> };

const MODES = ['regular', 'pve'] as const;
const BASE_URL = 'https://json.tarkov.dev';
const failures: string[] = [];
const summaries: string[] = [];

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

function check(condition: unknown, message: string): void {
  if (!condition) failures.push(message);
}

function translated(dict: Record<string, string>, raw: string | undefined): string {
  if (!raw) return '';
  return (dict[raw] ?? raw).trim();
}

function validClass(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 6;
}

function validRatio(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1;
}

function checkZones(owner: string, zones: string[]): void {
  for (const zone of zones) {
    check(Boolean(ZONE_LABELS[zone]), `${owner}: 알 수 없는 방호 구역 ${zone}`);
  }
}

for (const mode of MODES) {
  const [itemsDocument, koreanDocument] = await Promise.all([
    fetchJson<ItemsDocument>(`/${mode}/items`),
    fetchJson<TranslationDocument>(`/${mode}/items_ko`),
  ]);
  const items = Object.values(itemsDocument.data?.items ?? {});
  const korean = koreanDocument.data ?? {};
  const plates = new Map(
    items.filter((item) => item.types?.includes('armorPlate')).map((item) => [item.id, item]),
  );
  const armor = items.filter(
    (item) => item.types?.includes('armor') && !item.types.includes('armorPlate'),
  );
  let compatibleClassInflations = 0;

  check(armor.length > 0, `${mode}: 방탄복이 없습니다.`);
  check(plates.size > 0, `${mode}: 방탄판이 없습니다.`);

  for (const item of [...armor, ...plates.values()]) {
    const properties = item.properties ?? {};
    const name = localizeArmorItemName(item.id, translated(korean, item.name), 'ko');
    check(
      !/\b(?:body armor|plate carrier|armored rig|assault armor|ballistic plates?)\b|바디 아머/i.test(name),
      `${mode}/${item.id}: 한국어 이름에 미번역 방탄 장비 용어가 남았습니다: ${name}`,
    );
    check(validClass(properties.class), `${mode}/${item.id}: 잘못된 방탄 등급 ${properties.class}`);
    checkZones(`${mode}/${item.id}`, properties.zones ?? []);
    for (const field of ['speedPenalty', 'turnPenalty', 'ergoPenalty', 'bluntThroughput'] as const) {
      check(validRatio(properties[field]), `${mode}/${item.id}: 잘못된 ${field} ${properties[field]}`);
    }
    if (properties.material) {
      check(
        localizeMaterial(properties.material, 'ko') !== properties.material,
        `${mode}/${item.id}: 미번역 재질 ${properties.material}`,
      );
    }

    const slots = properties.armorSlots ?? [];
    const allowedClasses: number[] = [];
    for (const slot of slots) {
      const rawName = slot.name ?? slot.nameId;
      const slotName = localizeArmorLayerName(translated(korean, rawName), 'ko');
      check(
        !/\b(?:insert|plate|layer|armor|materials|alloy)\b/i.test(slotName),
        `${mode}/${item.id}: 미번역 방탄층 이름 ${slotName}`,
      );
      checkZones(`${mode}/${item.id}/${slotName}`, slot.zones ?? []);
      if (slot.class !== undefined) {
        check(validClass(slot.class), `${mode}/${item.id}/${slotName}: 잘못된 방탄 등급 ${slot.class}`);
        check(
          typeof slot.durability === 'number' && slot.durability > 0,
          `${mode}/${item.id}/${slotName}: 잘못된 내구도 ${slot.durability}`,
        );
      }
      const material = slot.armorMaterial ?? slot.material;
      if (material) {
        check(
          localizeMaterial(material, 'ko') !== material,
          `${mode}/${item.id}/${slotName}: 미번역 재질 ${material}`,
        );
      }
      for (const plateId of slot.allowedPlates ?? []) {
        const plate = plates.get(plateId);
        check(Boolean(plate), `${mode}/${item.id}/${slotName}: 존재하지 않는 방탄판 ${plateId}`);
        if (validClass(plate?.properties?.class)) allowedClasses.push(Number(plate?.properties?.class));
      }
    }
    if (armor.includes(item) && allowedClasses.some((value) => value > Number(properties.class))) {
      compatibleClassInflations += 1;
    }
  }

  summaries.push(
    `${mode}: 방탄복 ${armor.length}개, 방탄판 ${plates.size}개, 호환 방탄판 최고 등급이 기본 구성보다 높은 방탄복 ${compatibleClassInflations}개`,
  );
}

for (const summary of summaries) console.log(summary);
if (failures.length) {
  for (const failure of failures) console.error(`오류: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('방탄복 원본 필드, 방호 구역, 호환 방탄판 참조, 수치 범위와 한국어 표기를 모두 확인했습니다.');
}
