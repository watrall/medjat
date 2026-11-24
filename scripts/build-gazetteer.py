"""Build data/places.json from the Pleiades bulk dumps.

Input: the weekly places and names CSV dumps at https://atlantides.org/downloads/pleiades/dumps/.
Places with a representative point inside Egypt are kept if at least one feature type is a
site-like type. Coordinates are copied, never inferred. A name is used for matching publication
text only if it passes the rules below; every other name stays searchable but never matches.

    python3 scripts/build-gazetteer.py            # build from the cached dumps, downloading if absent
    python3 scripts/build-gazetteer.py --refresh  # download the dumps again first
    python3 scripts/build-gazetteer.py --review   # also print the names the rules accept, for review
"""
import argparse
import csv
import datetime
import gzip
import hashlib
import json
import pathlib
import re
import shutil
import unicodedata
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / '.cache' / 'pleiades'
DUMPS = 'https://atlantides.org/downloads/pleiades/dumps/'
FILES = {'places': 'pleiades-places-latest.csv.gz', 'names': 'pleiades-names-latest.csv.gz'}

# Reviewed starting points. The label is what the app shows; the aliases come from the name policy.
FEATURED = {
    '756512': 'Abydos', '149576487': 'Amarna', '786037': 'Hierakonpolis',
    '736963': 'Memphis', '796289136': 'Saqqara', '442962448': 'Giza',
    '786017': 'Thebes', '786050': 'Karnak', '786021': 'Elephantine',
    '786089': 'Philae', '785974': 'Edfu', '786127': 'Dendera', '786059': 'Esna',
    '786079': 'Kom Ombo', '727070': 'Alexandria', '727236': 'Tanis',
    '727088': 'Bubastis', '727217': 'Sais', '727117': 'Heliopolis',
    '756574': 'Hermopolis Magna', '756518': 'Antinoopolis', '736983': 'Oxyrhynchus',
    '736918': 'Hawara', '736953': 'Lahun', '864388873': 'Deir el-Medina',
}

# Pleiades feature types grouped into the categories people filter by. Types not listed here
# (roads, provinces, rivers, labels, peoples, regions) do not describe a site and are dropped.
CATEGORIES = {
    'settlement': ('Settlement or town', ['settlement', 'settlement-modern', 'fortified-settlement']),
    'sacred': ('Temple or sanctuary', ['temple', 'temple-2', 'sanctuary']),
    'burial': ('Cemetery, tomb or pyramid', ['cemetery', 'tomb', 'pyramid']),
    'christian': ('Church or monastery', ['church', 'church-2', 'monastery', 'abbey']),
    'fort': ('Fort or road station', ['fort', 'fort-2', 'station']),
    'extraction': ('Quarry or mine', ['quarry', 'mine-2']),
    'other': ('Other site', ['archaeological-site', 'island', 'oasis', 'port', 'monument',
                              'architecturalcomplex', 'well', 'dam', 'bath', 'ruin', 'findspot',
                              'production', 'mountain']),
}
TYPE_TO_CATEGORY = {t: key for key, (_, types) in CATEGORIES.items() for t in types}

# Pleiades period keys grouped to the periods Egyptian archaeology uses.
PERIODS = {
    'pharaonic': 'Pharaonic',
    'ptolemaic': 'Ptolemaic',
    'roman': 'Roman',
    'late-antique': 'Late antique',
    'islamic-modern': 'Islamic and modern',
}
PHARAONIC = ('predynastic', 'early-dynastic', 'old-kingdom', 'first-intermediate', 'middle-kingdom',
             'second-intermediate', 'new-kingdom', 'third-intermediate', 'late-period', 'archaic',
             'classical')


def period_of(key):
    if key.startswith(PHARAONIC) or '-bc-' in key:
        return 'pharaonic'
    if key.startswith(('ptolemaic', 'macedonian', 'hellenistic')):
        return 'ptolemaic'
    if 'late-antique' in key:
        return 'late-antique'
    if 'roman' in key:
        return 'roman'
    return 'islamic-modern' if key else None


def inside_egypt(lat, lon):
    """Approximate modern Egypt. A validation guard, not a historical or modern boundary."""
    if not (22.0 <= lat <= 31.7 and 25.0 <= lon <= 36.9):
        return False
    if lat < 25:
        return True
    if lat <= 29.49:
        return lon <= 34.92
    # The Sinai border runs from Taba (34.89, 29.49) to Rafah (34.27, 31.22).
    return lon <= 34.89 - (min(lat, 31.22) - 29.49) * 0.358


def point(row):
    try:
        return float(row['reprLat']), float(row['reprLong'])
    except ValueError:
        return None


def is_latin(text):
    return all(ch in " -'’‘ʿʾ.," or (ch.isalpha() and 'LATIN' in unicodedata.name(ch, '')) for ch in text)


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn')


def fetch(name, refresh):
    target = CACHE / FILES[name]
    if refresh or not target.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        request = urllib.request.Request(DUMPS + FILES[name], headers={'User-Agent': 'medjat-gazetteer-build'})
        with urllib.request.urlopen(request, timeout=120) as response, open(target, 'wb') as out:
            shutil.copyfileobj(response, out)
    return target


def rows(path):
    csv.field_size_limit(10 ** 9)
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as handle:
        yield from csv.DictReader(handle)


def digest(*paths):
    """Hash the decompressed dumps, so the value does not depend on how they were compressed."""
    sha = hashlib.sha256()
    for path in paths:
        with gzip.open(path, 'rb') as handle:
            for chunk in iter(lambda: handle.read(1 << 20), b''):
                sha.update(chunk)
    return sha.hexdigest()


def read_places(places_path):
    """Return every place, and the subset inside Egypt that has a site-like feature type."""
    everything = {row['id']: row for row in rows(places_path)}
    egypt = {}
    for pid, row in everything.items():
        coordinates = point(row)
        if not coordinates or not inside_egypt(*coordinates):
            continue
        types = {t.strip() for t in row['featureTypes'].split(',')}
        categories = sorted({TYPE_TO_CATEGORY[t] for t in types if t in TYPE_TO_CATEGORY})
        if categories or pid in FEATURED:
            egypt[pid] = dict(row, lat=coordinates[0], lon=coordinates[1], categories=categories)
    missing = set(FEATURED) - set(egypt)
    if missing:
        raise ValueError(f'Reviewed places are missing from the dump or outside Egypt: {sorted(missing)}')
    return everything, egypt


def read_names(names_path, everything, egypt):
    """Return the names of each Egyptian place, and which places use each name anywhere."""
    variants, owners = {}, {}
    def add(name, pid):
        owners.setdefault(fold(name), set()).add(pid)
        if pid in egypt:
            variants.setdefault(pid, set()).add(name)
    for row in rows(names_path):
        pid = row['pid'].rsplit('/', 1)[-1]
        for field in ('nameTransliterated', 'nameAttested'):
            for value in (row[field] or '').split(','):
                if value.strip():
                    add(unicodedata.normalize('NFC', value.strip()), pid)
    for pid, row in everything.items():
        for part in row['title'].split('/'):
            if part.strip():
                add(unicodedata.normalize('NFC', part.strip()), pid)
    return variants, owners


def build_place(pid, row, names, owners, outside, stop, policy):
    featured = pid in FEATURED
    if featured:
        reviewed = policy['sites'][pid]
        absent = [alias for alias in reviewed if alias not in names]
        if absent:
            raise ValueError(f'{FEATURED[pid]}: reviewed names absent from the Pleiades dump: {absent}')
        aliases = sorted({FEATURED[pid], *reviewed})
    else:
        aliases = sorted(
            name for name in names
            if len(name) >= 5 and is_latin(name) and fold(name) not in stop and owners[fold(name)] == {pid}
        )
    tags = row['tags']
    place = dict(
        id=pid,
        name=FEATURED[pid] if featured else unicodedata.normalize('NFC', row['title'].strip()),
        latitude=round(row['lat'], 5),
        longitude=round(row['lon'], 5),
        types=row['categories'],
    )
    periods = {period_of(key.strip()) for key in row['timePeriodsKeys'].split(',')} - {None}
    if periods:
        place['periods'] = sorted(periods, key=list(PERIODS).index)
    if row['locationPrecision'] in ('rough', 'related'):
        place['precision'] = row['locationPrecision']
    if featured:
        place['featured'] = True
    if featured or any(mark in tags for mark in ('dare:major=1', 'major settlement', 'major fort')):
        place['major'] = True
    if any(owners.get(fold(alias), set()) & outside for alias in aliases):
        place['shared'] = True
    place['aliases'] = aliases
    place['otherNames'] = sorted(name for name in names if name not in aliases and is_latin(name))
    return place


def write(path, header, places):
    """One place per line, so that a rebuilt index produces a readable diff."""
    lines = ',\n'.join(json.dumps(place, ensure_ascii=False, separators=(',', ':')) for place in places)
    body = json.dumps(header, ensure_ascii=False, indent=2)[:-2]
    path.write_text(f'{body},\n  "places": [\n{lines}\n  ]\n}}\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--review', action='store_true')
    args = parser.parse_args()
    policy = json.loads((ROOT / 'data/place-name-policy.json').read_text())
    places_path, names_path = fetch('places', args.refresh), fetch('names', args.refresh)

    everything, egypt = read_places(places_path)
    variants, owners = read_names(names_path, everything, egypt)
    outside = {pid for pid, row in everything.items() if (c := point(row)) and not inside_egypt(*c)}
    stop = {fold(name) for name in policy['notPlaceNames']}
    places = []
    for pid, row in sorted(egypt.items(), key=lambda item: int(item[0])):
        names = {n for n in (row['title'].strip(), *row['title'].split('/'), *variants.get(pid, ())) if n.strip()}
        names = {unicodedata.normalize('NFC', n.strip()) for n in names}
        places.append(build_place(pid, row, names, owners, outside, stop, policy))

    header = dict(
        source='Pleiades',
        attribution='Pleiades contributors; Ancient World Mapping Center and Institute for the Study of the Ancient World',
        license='CC BY 3.0',
        licenseURL='https://creativecommons.org/licenses/by/3.0/',
        retrievedAt=datetime.date.fromtimestamp(places_path.stat().st_mtime).isoformat(),
        namesReviewedAt=policy['reviewedAt'],
        sourceSHA256=digest(places_path, names_path),
        namePolicy=policy['policy'],
        types={key: label for key, (label, _) in CATEGORIES.items()},
        periods=PERIODS,
        count=len(places),
    )
    write(ROOT / 'data/places.json', header, places)
    print(f'Wrote {len(places)} Pleiades places ({sum(1 for p in places if p["aliases"])} can match publication text)')
    if args.review:
        print('\n'.join(sorted({a for p in places if not p.get('featured') for a in p['aliases']}, key=str.lower)))


if __name__ == '__main__':
    main()
