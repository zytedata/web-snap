# Web-snaphots

Create "perfect" snapshots of web pages.


## Install

``` shell
$ npm install git+https://github.com/croqaz/web-snap.git
```

## Usage

``` shell
$ web-record https://en.wikipedia.org/wiki/Online_and_offline
```

This will open a Chrome-like browser, show you the page and create an output file called by default: "snapshot_en.wikipedia.org.json"
To restore this snapshot file, you can use:

``` shell
$ web-restore snapshot_en.wikipedia.org.json
```

This will open a Chrome-like browser, show the page and you can read it even if you're offline.

You can also save and restore more complicated pages, like Amazon products:

``` shell
$ web-record https://www.amazon.com/dp/B07978J597/
$ web-restore snapshot_amazon.com.json
```

Note that some pages should be scrolled a little bit, to make sure all the page and images are loaded before the snapshot is taken.
This is not a limitation of web-snap, it's how modern browsers and pages are intentionally built to load resources lazily.


## Similar

- https://github.com/Y2Z/monolith
- https://github.com/go-shiori/obelisk
- https://github.com/danburzo/percollate
- https://github.com/croqaz/clean-mark

Also check:

- https://crlf.link/mem/offline
- https://crlf.link/mem/web-archiving
