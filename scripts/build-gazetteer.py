"""Refresh the small reviewed site list from canonical Pleiades JSON records.

Names were selected using the Pleiades name index. Coordinates are copied, never
inferred. The Egypt extent is a validation guard, not a historical boundary.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess

SITES = {
    'Abydos': '756512', 'Amarna': '149576487', 'Hierakonpolis': '786037',
    'Memphis': '736963', 'Saqqara': '796289136', 'Giza': '442962448',
    'Thebes': '786017', 'Karnak': '786050', 'Elephantine': '786021',
    'Philae': '786089', 'Edfu': '785974', 'Dendera': '786127', 'Esna': '786059',
    'Kom Ombo': '786079', 'Alexandria': '727070', 'Tanis': '727236',
    'Bubastis': '727088', 'Sais': '727217', 'Heliopolis': '727117',
    'Hermopolis Magna': '756574', 'Antinoopolis': '756518', 'Oxyrhynchus': '736983',
    'Hawara': '736918', 'Lahun': '736953', 'Deir el-Medina': '864388873',
}

ROOT = pathlib.Path(__file__).resolve().parent.parent

def build(item, snapshot, policy):
    label, identifier = item
    source = f'https://pleiades.stoa.org/places/{identifier}'
    raw = snapshot['sites'][identifier]
    lon, lat = raw['reprPoint']
    if not (23 <= lat <= 33 and 25 <= lon <= 36):
        raise ValueError(f'{label} coordinates outside expected Egypt extent: {lon}, {lat}')
    candidates = {}
    for name in raw.get('names', []):
        for field in ('attested', 'romanized'):
            for variant in (name.get(field) or '').split(','):
                variant = variant.strip()
                if variant:
                    candidates.setdefault(variant, []).append(dict(field=field, language=name.get('language') or None, source=name.get('uri') or source))
    chosen = policy['sites'][identifier]
    for alias in chosen:
        if alias not in candidates:
            raise ValueError(f'{label}: reviewed alias absent from source: {alias}')
    aliases = sorted({label, *chosen})
    return dict(id=identifier, name=label, sourceTitle=raw['title'], longitude=lon, latitude=lat, aliases=aliases, nameVariants=[dict(name=alias, attestations=candidates.get(alias, [])) for alias in aliases], source=source)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build from the reviewed source snapshot; --refresh fetches canonical records first and requires name-policy review.')
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    source_file = ROOT / 'data/pleiades-name-snapshot.json'
    snapshot = json.loads(source_file.read_text())
    if args.refresh:
        import datetime
        snapshot = dict(retrievedAt=datetime.date.today().isoformat(), source='Pleiades canonical JSON records', sites={})
        for identifier in SITES.values():
            raw = json.loads(subprocess.check_output(['curl', '-f', '-sS', '-L', '--max-time', '30', f'https://pleiades.stoa.org/places/{identifier}/json']))
            snapshot['sites'][identifier] = dict(title=raw['title'], reprPoint=raw['reprPoint'], names=[{key: name.get(key) for key in ('attested', 'romanized', 'language', 'uri', 'associationCertainty', 'transcriptionCompleteness')} for name in raw.get('names', [])])
    policy = json.loads((ROOT / 'data/place-name-policy.json').read_text())
    sites = [build(item, snapshot, policy) for item in SITES.items()]
    source_text = json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n'
    result = dict(source='Pleiades', attribution='Pleiades contributors; Ancient World Mapping Center and Institute for the Study of the Ancient World', license='CC BY 3.0', licenseURL='https://creativecommons.org/licenses/by/3.0/', retrievedAt=snapshot['retrievedAt'], namesReviewedAt=policy['reviewedAt'], sourceSHA256=hashlib.sha256(source_text.encode()).hexdigest(), namePolicy=policy['policy'], sites=sites)
    if args.refresh:
        source_file.write_text(source_text)
    ROOT.joinpath('data/sites.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f'Validated and wrote {len(sites)} Pleiades places')
