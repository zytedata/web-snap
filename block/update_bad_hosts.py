"""
Example usage:
  python block/update_bad_hosts.py block/blocklist.txt
"""
import sys
import requests


def upd_easylist():
    name = 'EASYLIST'
    URL = 'https://v.firebog.net/hosts/Easylist.txt'
    r = requests.get(URL)
    print(r, URL)
    hosts = set()
    for line in r.text.split('\n')[3:]:
        line = line.strip()
        if not line or line[0] == '#':
            continue
        hosts.add(line.strip())
    print(f'{name} found hosts: {len(hosts)}')
    return name, hosts


def upd_adaway():
    name = 'ADAWAY'
    URL = 'https://adaway.org/hosts.txt'
    r = requests.get(URL)
    print(r, URL)
    hosts = set()
    for line in r.text.split('\n'):
        line = line.strip()
        if not line or line[0] == '#':
            continue
        if line.startswith('127.0.0.1 '):
            hosts.add(line[9:].strip())
    print(f'{name} found hosts: {len(hosts)}')
    return name, hosts


def upd_disconnect():
    name = 'DISCONNECT'
    URL = 'https://s3.amazonaws.com/lists.disconnect.me/simple_ad.txt'
    r = requests.get(URL)
    print(r, URL)
    hosts = set()
    for line in r.text.split('\n')[3:]:
        line = line.strip()
        if not line or line[0] == '#':
            continue
        hosts.add(line.strip())
    print(f'{name} found hosts: {len(hosts)}')
    return name, hosts


def upd_w3kbl():
    name = 'W3KBL'
    URL = 'https://v.firebog.net/hosts/static/w3kbl.txt'
    r = requests.get(URL)
    print(r, URL)
    hosts = set()
    for line in r.text.split('\n')[6:]:
        line = line.strip()
        if not line or line[0] == '#':
            continue
        hosts.add(line.strip().split(" ")[0])
    print(f'{name} found hosts: {len(hosts)}')
    return name, hosts


def save_result():
    OUTPUT = sys.argv[1] if len(sys.argv) > 1 else 'blocklist.txt'

    # Custom list of block rules
    CUSTOM = set([
        # google
        'google-analytics.com',
        'google.com/adsense/search',
        'google.com/recaptcha',
        'gstatic.com/recaptcha/releases',
        # amazon
        'fls-na.amazon.com',
        'cloudfront-labs.amazonaws.com',
        'unagi.amazon.com/\\d/events',
        # other
        'match.adsrvr.org/track',
        # cookie popups
        'cdn.cookielaw.org',
    ])
    # popular lists
    _, easy = upd_easylist()
    _, adaway = upd_adaway()
    _, disco = upd_disconnect()
    _, w3kbl = upd_w3kbl()

    hosts = CUSTOM | (adaway & w3kbl) | (adaway & easy) | (easy & w3kbl) | (w3kbl & disco)
    with open(OUTPUT, 'w') as fd:
        fd.write('# Generated from update_bad_hosts.py\n')
        for x in sorted(hosts):
            if len(x) < 5: continue
            fd.write(f'{x}\n')
        fd.write('\n')
    print(f'Written {len(hosts)} hosts in {OUTPUT}')


if __name__ == '__main__':
    save_result()
