# FSBucket

FSBucket is a web server that provides a simple file storage service backed by a
file system. It is designed to be used as a building block for more complex
applications. It intentionally has a simple and very limited API.

## Environment Variables

- `FSBUCKET_BASE_DIR`: The base directory for file storage.
- `FSBUCKET_SECRET_KEY`: The secret key for signature validation.
- `PORT`: The port the server will listen on.

## Operations

FSBucket supports two operations: GET and PUT.

### GET

The GET operation is used to retrieve files. It validates the request signature
and the safety of the requested path before proceeding. If the file exists and
the request includes a range header, it will return the requested range of
bytes. Otherwise, it will return the entire file.

### PUT

The PUT operation is used to upload files. It also validates the request
signature and the safety of the requested path. If the file already exists, it
will return an error. Otherwise, it will write the incoming request data to a
temporary file, and then rename the temporary file to the requested path. This
ensures that the file is not partially written if the request is interrupted.

## Important limitations

The limitations of FSBucket can also be considered as advantages; A simple
service is easier to maintain and has fewer security risks. However, it is
important to be aware of the limitations.

- FSBucket does not support directory listings. It only supports GET and PUT operations.
- FSBucket does not support file deletion, replacement or renaming.
- FSBucket does not support multipart uploads.

The authenticiation mechanism is very simple, and the idea is to supply the
complex logic in other processes and APIs. For example, you could have a
serverless API that knows the secret key and can generate signed URLs based on
the user's identity and the requested path.

## Installation and usage

To install the dependencies, run:

```bash
npm install
```

To run the server, run:

```bash
export FSBUCKET_BASE_DIR=/path/to/storage
export FSBUCKET_SECRET_KEY=secret (must be at least 64 characters long)
export PORT=3000
npm start
```

## Docker

You can run the server using docker. For example

```bash
docker run -e FSBUCKET_BASE_DIR=/home/user/fsbucket -e FSBUCKET_SECRET_KEY=UNDW13UBcI5MRiajzxBcD35KAUtVtELl7hlRFiiTaKMaJyFFJQoqaHQxbMj386fq -p 3010:8080 -v /home/user/fsbucket:/home/user/fsbucket -it magland/fsbucket:0.1.0
```

## Kubernetes

Kubernetes deployment files will be provided soon.

## License

This project is licensed under the terms of the Apache 2.0 License.

## Authors

Jeremy Magland, Center for Computational Mathematics, Flatiron Institute
