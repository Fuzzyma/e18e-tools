```sh
npx github:Fuzzyma/e18e-tools --help
```

You probably want this for ci output and all results in a json file:

```sh
npx github:Fuzzyma/e18e-tools packagename -n 100 -f json-output.json -u user -p 'password' -U couchdbdatabase
```

Or if you want the md file:

```sh
npx github:Fuzzyma/e18e-tools packagename -n 100 -q -o md -u user -p 'password' -U couchdbdatabase > md-output.md
```

Alternatively you can use the `format` command to turn a json into an md file:

```sh
npx -p github:Fuzzyma/e18e-tools format json-output.json -f md -n 100
```
