import {
  useMemo,
  useState,
} from 'react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  ArrowLeft,
  Boxes,
  Camera,
  Check,
  FileImage,
  FileText,
  ImageUp,
  LoaderCircle,
  Package,
  RotateCcw,
  Tag,
} from 'lucide-react'

import {
  createQuickReception,
  type QuickPhotoType,
  type QuickReceptionClient,
} from '../../services/quickReceivingService'

type PhotoRequirement = {
  type: QuickPhotoType
  label: string
  Icon: typeof FileText
}

const requirements: Record<
  QuickReceptionClient,
  PhotoRequirement[]
> = {
  UPS: [
    {
      type: 'invoice',
      label: 'Factura',
      Icon: FileText,
    },
    {
      type: 'labels',
      label: 'Labels',
      Icon: Tag,
    },
    {
      type: 'boxes',
      label: 'Cajas',
      Icon: Boxes,
    },
  ],

  A1: [
    {
      type: 'invoice',
      label: 'Factura',
      Icon: FileText,
    },
    {
      type: 'boxes',
      label: 'Cajas',
      Icon: Boxes,
    },
    {
      type: 'labels',
      label: 'Labels',
      Icon: Tag,
    },
    {
      type: 'pallet',
      label: 'Tarima',
      Icon: Package,
    },
  ],
}

const MAX_FILE_SIZE =
  15 * 1024 * 1024

export function QuickReceivingPage() {
  const navigate = useNavigate()

  const [
    client,
    setClient,
  ] =
    useState<QuickReceptionClient>('A1')

  const [
    photos,
    setPhotos,
  ] = useState<
    Partial<
      Record<
        QuickPhotoType,
        File
      >
    >
  >({})

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    successReference,
    setSuccessReference,
  ] = useState('')

  const clientRequirements =
    requirements[client]

  const completedCount =
    useMemo(
      () =>
        clientRequirements.filter(
          (
            requirement,
          ) =>
            Boolean(
              photos[
                requirement
                  .type
              ],
            ),
        ).length,
      [
        clientRequirements,
        photos,
      ],
    )

  const isComplete =
    completedCount ===
    clientRequirements.length

  function changeClient(
    nextClient:
      QuickReceptionClient,
  ) {
    const allowed =
      new Set(
        requirements[
          nextClient
        ].map(
          (
            requirement,
          ) =>
            requirement.type,
        ),
      )

    setClient(nextClient)

    setPhotos(
      (
        current,
      ) =>
        Object.fromEntries(
          Object.entries(
            current,
          ).filter(
            (
              [
                type,
              ],
            ) =>
              allowed.has(
                type as QuickPhotoType,
              ),
          ),
        ),
    )

    setError('')
    setSuccessReference('')
  }

  function selectPhoto(
    type: QuickPhotoType,
    file?: File,
  ) {
    if (!file) {
      return
    }

    if (
      !file.type.startsWith(
        'image/',
      )
    ) {
      setError(
        'Selecciona una imagen válida.',
      )

      return
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      setError(
        'Cada fotografía debe pesar menos de 15 MB.',
      )

      return
    }

    setError('')

    setPhotos(
      (
        current,
      ) => ({
        ...current,
        [type]: file,
      }),
    )
  }

  function resetForm() {
    setPhotos({})
    setError('')
    setSuccessReference('')
  }

  async function completeReception() {
    if (
      !isComplete ||
      submitting
    ) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const result =
        await createQuickReception(
          client,

          clientRequirements.map(
            (
              requirement,
            ) => ({
              type:
                requirement.type,

              file:
                photos[
                  requirement
                    .type
                ] as File,
            }),
          ),
        )

      setSuccessReference(
        result.reference_number,
      )
    } catch (
      caughtError
    ) {
      setError(
        caughtError instanceof
        Error
          ? caughtError.message
          : 'No se pudo guardar la recepción rápida.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (
    successReference
  ) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
        <section className="w-full rounded-3xl border border-emerald-500/30 bg-slate-900 p-6 text-center shadow-xl sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-slate-950">
            <Check
              size={34}
            />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-white">
            Recepción completada
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Las fotografías de{' '}
            {client}{' '}
            se guardaron correctamente.
          </p>

          <p className="mt-5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-lg font-semibold text-emerald-400">
            {
              successReference
            }
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={
                resetForm
              }
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              <RotateCcw
                size={19}
              />

              Nueva recepción rápida
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(
                  '/operations/receiving',
                )
              }
              className="min-h-12 rounded-xl border border-slate-700 px-5 font-semibold text-slate-300 transition hover:bg-slate-800"
            >
              Volver a recepciones
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-28 sm:pb-8">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            navigate(
              '/operations/receiving',
            )
          }
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
          aria-label="Volver a recepciones"
        >
          <ArrowLeft
            size={22}
          />
        </button>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Aduana Project 2.0
          </p>

          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Recepción rápida
          </h1>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="border-b border-slate-800 p-4 sm:p-5">
          <label
            className="block text-sm font-semibold text-slate-300"
            htmlFor="quick-client"
          >
            Cliente
          </label>

          <select
            id="quick-client"
            value={
              client
            }
            disabled={
              submitting
            }
            onChange={(
              event,
            ) =>
              changeClient(
                event.target
                  .value as QuickReceptionClient,
              )
            }
            className="mt-2 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-base font-semibold outline-none transition focus:border-emerald-500"
          >
            <option value="A1">
              A1
            </option>

            <option value="UPS">
              UPS
            </option>
          </select>
        </div>

        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-semibold text-white">
              Fotos obligatorias
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              Toma una foto clara de cada elemento.
            </p>
          </div>

          <span className="rounded-full bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-300">
            {
              completedCount
            }{' '}
            de{' '}
            {
              clientRequirements.length
            }
          </span>
        </div>

        <div className="divide-y divide-slate-800">
          {clientRequirements.map(
            ({
              type,
              label,
              Icon,
            }) => {
              const file =
                photos[
                  type
                ]

              return (
                <article
                  key={
                    type
                  }
                  className="grid grid-cols-[auto_1fr] items-center gap-3 p-4 sm:grid-cols-[auto_1fr_auto] sm:px-5"
                >
                  <div
                    className={[
                      'flex h-11 w-11 items-center justify-center rounded-xl',

                      file
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-slate-800 text-slate-400',
                    ].join(
                      ' ',
                    )}
                  >
                    {file ? (
                      <Check
                        size={22}
                      />
                    ) : (
                      <Icon
                        size={22}
                      />
                    )}
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-semibold text-white">
                      {
                        label
                      }{' '}

                      <span className="text-red-400">
                        *
                      </span>
                    </h3>

                    <p
                      className={[
                        'truncate text-xs',

                        file
                          ? 'text-emerald-400'
                          : 'text-slate-500',
                      ].join(
                        ' ',
                      )}
                    >
                      {file
                        ? file.name
                        : 'Pendiente'}
                    </p>
                  </div>

                  <div className="col-span-2 grid grid-cols-[1fr_auto] gap-2 sm:col-span-1 sm:flex">
                    <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                      <Camera
                        size={19}
                      />

                      {file
                        ? 'Repetir foto'
                        : 'Tomar foto'}

                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={
                          submitting
                        }
                        onChange={(
                          event,
                        ) => {
                          selectPhoto(
                            type,
                            event
                              .target
                              .files?.[0],
                          )

                          event.target.value =
                            ''
                        }}
                        className="sr-only"
                      />
                    </label>

                    <label
                      className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition hover:bg-slate-800"
                      aria-label={`Subir foto de ${label}`}
                    >
                      {file ? (
                        <FileImage
                          size={20}
                        />
                      ) : (
                        <ImageUp
                          size={20}
                        />
                      )}

                      <input
                        type="file"
                        accept="image/*"
                        disabled={
                          submitting
                        }
                        onChange={(
                          event,
                        ) => {
                          selectPhoto(
                            type,
                            event
                              .target
                              .files?.[0],
                          )

                          event.target.value =
                            ''
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </article>
              )
            },
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {
            error
          }
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-900/95 p-4 backdrop-blur lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0">
        <button
          type="button"
          disabled={
            !isComplete ||
            submitting
          }
          onClick={() =>
            void completeReception()
          }
          className="mx-auto flex min-h-14 w-full max-w-3xl items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          {submitting ? (
            <>
              <LoaderCircle
                size={21}
                className="animate-spin"
              />

              Guardando fotografías…
            </>
          ) : (
            <>
              <Check
                size={21}
              />

              Completar recepción
            </>
          )}
        </button>
      </div>
    </div>
  )
}