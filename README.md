# FSBucket

FSBucket is a server that provides a web interface to a directory on a file
system. It is designed to be used as a building block for more complex
applications. It intentionally has a simple and very limited API.

## Running the server

There are three ways to run the server: directly using node, using docker, or
using kubernetes. Here we give instructions for running the server directly.

First set the following environment variables:

- `FSBUCKET_BASE_DIR`: The absolute path of the base directory for file storage.
- `FSBUCKET_SECRET_KEY`: The secret key for signature validation, at least 64
  characters long. Other services in your application should know this secret in
  order to generate signed URLs.
- `PORT`: The port the server will listen on.

Then install and run the server:

```bash
# Only needed the first time
npm install

# Run the server
npm start
```

## Operations

FSBucket supports two operations: GET and PUT.

### GET

The GET operation is used to retrieve files. It validates the request signature
and the safety of the requested path before proceeding. If the file exists and
the request includes a range header, it will return the requested range of
bytes. Otherwise, it will return the contents of the entire file.

The format of the request URL is:

```
method: GET
http://<server>:<port>/<path>?<query>
```

where `<server>` is the server name or IP address, `<port>` is the port number,
`<path>` is the path of the file relative to the base directory, and `<query>`
is the query string. The query string must include the following parameters:

- `signature`: The signature of the request, generated using the secret key
  using the method described below.
- `expires`: The expiration time of the request, in seconds since the epoch.

The signature is generated using the following method:

1. Concatenate the following strings using newlines: the request method (GET),
   the path, the expiration time, and the secret key.
2. Compute the SHA1 hash of the concatenated string. This is the signature.

```
signature = sha1(method + '\n' + path + '\n' + expires + '\n' + secret_key)
```

To request a range of bytes, use the HTTP range header. For example:

```
Range: bytes=0-99
```

### PUT

The PUT operation is used to upload files, and is very similar to the GET
operation. It validates the request signature and the safety of the requested
path before proceeding. Importantly, if the file already exists, it will NOT be
overwritten, and the request will fail.

The format of the request URL is:

```
method: PUT
http://<server>:<port>/<path>?<query>
```

where `<server>`, `<port>`, `<path>`, and `<query>` are the same as for the GET
operation, and the signature is generated using the same method as for GET.

## Important limitations

The limitations of FSBucket can also be considered as advantages; A simple
service is easier to maintain and has fewer security risks. Note that none of
the operations are destructive. The idea is to use FSBucket as part of a more
complex application, with other services providing additional functionality
such as file deletion, renaming, and replacement.

FSBucket does NOT support:
- Directory listings
- File deletion, renaming, or replacement
- Multipart uploads

The authenticiation mechanism is intentionally very simple, with the expectation
that other services in your application will provide more sophisticated logic
for authentication and authorization. For example, you could have a serverless
API that knows the secret key and can generate signed URLs based on the user's
identity and the requested path.

## Docker

You can run the server using docker. For example

```bash
docker run \
    -e FSBUCKET_BASE_DIR=/fsbucket-data \
    -e FSBUCKET_SECRET_KEY=UNDW13UBcI5MRiajzxBcD35KAUtVtELl7hlRFiiTaKMaJyFFJQoqaHQxbMj386fq \
    -e PORT=8080 \
    -p 3010:8080 \
    -v /home/user/fsbucket-data:/fsbucket-data \
    -it magland/fsbucket:0.1.0
```

## Kubernetes

Kubernetes configuration files will be provided soon.

## Why not multi-part uploads?

It's true that multi-part uploads would provide advantages when uploading large
files. However, support for this would make the server more complex. The
expectation is that the larger application would contain the logic for splitting
files into chunks, uploading them to a temporary locations on the file system,
and then concatenating the chunks at the destination file.

## Security considerations

Do not share the private key except with the other services in your application.

Even if a user could inspect the signatures of billions or trillions of request, it
is practically impossible to reverse engineer the secret key from the
signatures. This is because the secret key has 64 characters (it is recommended
to randomly generate a string with alphanumeric characters), and the size of a
sha1 hash is only 20 bytes. So even if someone could invert the sha1 operation, they
would need to guess from an enormous space of possible secret keys. Furthermore, without
the secret key it is practically impossible to generate a valid signature.

Furthermore, as mentioned above, even if the secret key were to be compromised, the
consequences would be limited because the API is so limited.

In summary, there is not much risk in exposing a file system to the internet
via FSBucket.

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## License

This project is licensed under the terms of the Apache 2.0 License.

## Authors

Jeremy Magland, Center for Computational Mathematics, Flatiron Institute
