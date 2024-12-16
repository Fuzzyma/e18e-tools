To learn more about the e18e project, visit [e18e.dev](https://e18e.dev).
The [cleanup-section](https://e18e.dev/guide/cleanup.html) contains a couchdb instance that you can use.

If you need help, visit our [discord](https://chat.e18e.dev/) or text me on [bluesky](https://bsky.app/profile/fuzzyma.bsky.social).

```sh
npx github:Fuzzyma/e18e-tools --help
```

You probably want this for ci output and all results in a json file:

```sh
npx github:Fuzzyma/e18e-tools packagename -n 100 -f json-output.json -u user -p 'password' -U couchdbdatabase
```

Use `packagename@version` to filter all dependents whose semver range includes this version.

Or if you want the md file:

```sh
npx github:Fuzzyma/e18e-tools packagename -n 100 -q -o md -u user -p 'password' -U couchdbdatabase > md-output.md
```

Alternatively you can use the `format` command to turn a json into a different output. Here an md file:

```sh
npx -p github:Fuzzyma/e18e-tools format json-output.json -f md -n 100
```
