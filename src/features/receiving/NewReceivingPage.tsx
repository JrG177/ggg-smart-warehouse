import { useEffect, useState } from 'react'

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Package,
  Plus,
  ScanBarcode,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Truck,
} from 'lucide-react'

import {
  useNavigate,
} from 'react-router-dom'

import {
  createReception,
} from '../../services/receivingService'
import type { QuickReceptionPackageInput } from '../../services/quickReceivingService'
import { createNormalReceptionPackages } from '../../services/normalReceptionPackageService'
import { PackageLabelScanner } from './components/PackageLabelScanner'

const steps = [
  {
    id: 1,
    name: 'Llegada',
    icon: Truck,
  },
  {
    id: 2,
    name: 'Pallets',
    icon: Package,
  },
  {
    id: 3,
    name: 'Verificación',
    icon: ShieldCheck,
  },
  {
    id: 4,
    name: 'Resumen',
    icon: Check,
  },
]

function getToday() {
  const today =
    new Date()

  const year =
    today.getFullYear()

  const month =
    String(
      today.getMonth() +
        1,
    ).padStart(
      2,
      '0',
    )

  const day =
    String(
      today.getDate(),
    ).padStart(
      2,
      '0',
    )

  return `${year}-${month}-${day}`
}

function getCurrentTime() {
  const now =
    new Date()

  const hours =
    String(
      now.getHours(),
    ).padStart(
      2,
      '0',
    )

  const minutes =
    String(
      now.getMinutes(),
    ).padStart(
      2,
      '0',
    )

  return `${hours}:${minutes}`
}

type VerificationState = {
  packingListsReviewed: boolean
  partNumbersVerified: boolean
  physicalQuantitiesConfirmed: boolean
  damagesDocumented: boolean
  materialReady: boolean
}

type FormData = {
  carrier: string
  otherCarrier: string
  trailer: string
  palletCount: string
  seal: string
  receptionDate: string
  receptionTime: string
}

type PartItem = {
  id: string
  partNumber: string
  quantity: string
  boxes: string
  packages: string
  palletReference: string
}

type ScannedPackage = QuickReceptionPackageInput & {
  localId: string
  partId: string
}

type PalletPhoto = {
  id: string
  file: File
  preview: string
}

type PalletPhotos = {
  packingList: PalletPhoto[]
  palletLabel: PalletPhoto[]
  palletPhoto: PalletPhoto[]
  bol: PalletPhoto[]
  damage: PalletPhoto[]
}

type PalletDocuments = {
  packingListReference: string
  invoice: string
  documentationComplete: string
}

type PalletItem = {
  id: string
  damaged: string
  notes: string
  parts: PartItem[]
  scannedPackages: ScannedPackage[]
  documents: PalletDocuments
  photos: PalletPhotos
  completed: boolean
}

type PhotoType =
  | 'packingList'
  | 'palletLabel'
  | 'palletPhoto'
  | 'bol'
  | 'damage'


const DRAFT_STORAGE_KEY =
  'ggg-smart-warehouse:new-receiving-draft'

type DraftPalletItem = Omit<
  PalletItem,
  'photos'
> & {
  photos: {
    packingList: []
    palletLabel: []
    palletPhoto: []
    bol: []
    damage: []
  }
}

type ReceivingDraft = {
  formData: FormData
  pallets: DraftPalletItem[]
  verification: VerificationState
  currentStep: number
  currentPalletIndex: number
  savedAt: string
}

function toDraftPallet(
  pallet: PalletItem,
): DraftPalletItem {
  return {
    ...pallet,
    scannedPackages: pallet.scannedPackages ?? [],
    photos: {
      packingList: [],
      palletLabel: [],
      palletPhoto: [],
      bol: [],
      damage: [],
    },
  }
}

function restoreDraftPallet(
  pallet: DraftPalletItem,
): PalletItem {
  return {
    ...pallet,
    scannedPackages: pallet.scannedPackages ?? [],
    photos: {
      packingList: [],
      palletLabel: [],
      palletPhoto: [],
      bol: [],
      damage: [],
    },
  }
}

function createId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`
}

function createPart():
  PartItem {
  return {
    id:
      createId(),

    partNumber:
      '',

    quantity:
      '',

    boxes:
      '',

    packages:
      '',

    palletReference:
      '',
  }
}

function createPallet():
  PalletItem {
  return {
    id:
      createId(),

    damaged:
      'No',

    notes:
      '',

    parts: [
      createPart(),
    ],

    scannedPackages: [],

    documents: {
      packingListReference:
        '',

      invoice:
        '',

      documentationComplete:
        'Sí',
    },

    photos: {
      packingList:
        [],

      palletLabel:
        [],

      palletPhoto:
        [],

      bol:
        [],

      damage:
        [],
    },

    completed:
      false,
  }
}

export function NewReceivingPage() {
  const navigate =
    useNavigate()

  const [
    currentStep,
    setCurrentStep,
  ] =
    useState(1)

  const [
    currentPalletIndex,
    setCurrentPalletIndex,
  ] =
    useState(0)

  const [
    generalError,
    setGeneralError,
  ] =
    useState('')

  const [
    palletError,
    setPalletError,
  ] =
    useState('')

  const [
    saveError,
    setSaveError,
  ] =
    useState('')

  const [
    isSaving,
    setIsSaving,
  ] =
    useState(false)

  const [
    formData,
    setFormData,
  ] =
    useState<FormData>({
      carrier:
        'XPO',

      otherCarrier:
        '',

      trailer:
        '',

      palletCount:
        '',

      seal:
        '',

      receptionDate:
        getToday(),

      receptionTime:
        getCurrentTime(),
    })

  const [
    pallets,
    setPallets,
  ] =
    useState<
      PalletItem[]
    >([
      createPallet(),
    ])

  const [
    scannerPalletId,
    setScannerPalletId,
  ] = useState<string | null>(null)

  const [
    verification,
    setVerification,
  ] =
    useState<VerificationState>({
      packingListsReviewed:
        false,

      partNumbersVerified:
        false,

      physicalQuantitiesConfirmed:
        false,

      damagesDocumented:
        false,

      materialReady:
        false,
    })


  const [
    draftLoaded,
    setDraftLoaded,
  ] =
    useState(false)

  useEffect(
    () => {
      try {
        const savedDraft =
          window.localStorage.getItem(
            DRAFT_STORAGE_KEY,
          )

        if (
          !savedDraft
        ) {
          setDraftLoaded(
            true,
          )

          return
        }

        const parsedDraft =
          JSON.parse(
            savedDraft,
          ) as ReceivingDraft

        const shouldRestore =
          window.confirm(
            'Encontramos una recepción sin terminar guardada en este dispositivo. ¿Deseas continuarla?\n\nNota: las fotos deberán volver a seleccionarse porque el navegador no permite restaurar archivos locales automáticamente.',
          )

        if (
          shouldRestore
        ) {
          setFormData(
            parsedDraft.formData,
          )

          setPallets(
            parsedDraft.pallets.map(
              restoreDraftPallet,
            ),
          )

          setVerification(
            parsedDraft.verification,
          )

          setCurrentStep(
            parsedDraft.currentStep,
          )

          setCurrentPalletIndex(
            parsedDraft.currentPalletIndex,
          )
        } else {
          window.localStorage.removeItem(
            DRAFT_STORAGE_KEY,
          )
        }
      } catch (
        draftError
      ) {
        console.error(
          'No se pudo recuperar el borrador:',
          draftError,
        )

        window.localStorage.removeItem(
          DRAFT_STORAGE_KEY,
        )
      } finally {
        setDraftLoaded(
          true,
        )
      }
    },
    [],
  )

  useEffect(
    () => {
      if (
        !draftLoaded
      ) {
        return
      }

      const draft: ReceivingDraft = {
        formData,

        pallets:
          pallets.map(
            toDraftPallet,
          ),

        verification,

        currentStep,

        currentPalletIndex,

        savedAt:
          new Date()
            .toISOString(),
      }

      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify(
          draft,
        ),
      )
    },
    [
      draftLoaded,
      formData,
      pallets,
      verification,
      currentStep,
      currentPalletIndex,
    ],
  )

  const currentPallet =
    pallets[
      currentPalletIndex
    ]

  const updateField = (
    field:
      keyof FormData,

    value:
      string,
  ) => {
    setFormData(
      (
        previous,
      ) => ({
        ...previous,

        [field]:
          value,
      }),
    )

    setGeneralError(
      '',
    )
  }

  const updatePallet = (
    palletId:
      string,

    field:
      'damaged' |
      'notes',

    value:
      string,
  ) => {
    setPallets(
      (
        previous,
      ) =>
        previous.map(
          (
            pallet,
          ) => {
            if (
              pallet.id !==
              palletId
            ) {
              return pallet
            }

            if (
              field ===
                'damaged' &&
              value ===
                'No'
            ) {
              pallet.photos
                .damage
                .forEach(
                  (
                    photo,
                  ) => {
                    URL.revokeObjectURL(
                      photo.preview,
                    )
                  },
                )

              return {
                ...pallet,

                damaged:
                  value,

                photos: {
                  ...pallet.photos,

                  damage:
                    [],
                },
              }
            }

            return {
              ...pallet,

              [field]:
                value,
            }
          },
        ),
    )

    setPalletError(
      '',
    )
  }

  const addPart = (
    palletId:
      string,
  ) => {
    setPallets(
      (
        previous,
      ) =>
        previous.map(
          (
            pallet,
          ) =>
            pallet.id ===
            palletId
              ? {
                  ...pallet,

                  parts: [
                    ...pallet.parts,

                    createPart(),
                  ],
                }
              : pallet,
        ),
    )
  }

  const addScannedPackage = (
    palletId: string,
    item: QuickReceptionPackageInput,
  ) => {
    const duplicateSupplierId = Boolean(item.supplierPackageId) && pallets.some(
      (pallet) => pallet.scannedPackages.some(
        (current) =>
          current.supplierPackageId === item.supplierPackageId &&
          current.supplierPackageType === item.supplierPackageType,
      ),
    )

    if (duplicateSupplierId) {
      setPalletError('Esa label ya fue agregada a esta recepción.')
      return
    }

    setPallets((previous) => previous.map((pallet, palletIndex) => {
      if (pallet.id !== palletId) return pallet

      const partNumber = item.partNumber.trim().toUpperCase()
      const parts = pallet.parts.map((part) => ({ ...part }))
      let targetPart = parts.find(
        (part) => part.partNumber.trim().toUpperCase() === partNumber,
      )

      if (!targetPart) {
        targetPart = parts.find((part) => !part.partNumber.trim())
      }

      if (!targetPart) {
        targetPart = createPart()
        targetPart.palletReference = String(palletIndex + 1)
        parts.push(targetPart)
      }

      const currentQuantity = Number(targetPart.quantity) || 0
      const currentPackages = Number(targetPart.packages) || 0

      targetPart.partNumber = partNumber
      targetPart.quantity = item.quantity === null
        ? targetPart.quantity
        : String(currentQuantity + item.quantity)
      targetPart.packages = String(currentPackages + 1)
      targetPart.palletReference ||= String(palletIndex + 1)

      return {
        ...pallet,
        parts,
        scannedPackages: [
          ...pallet.scannedPackages,
          {
            ...item,
            partNumber,
            localId: crypto.randomUUID(),
            partId: targetPart.id,
          },
        ],
      }
    }))

    setPalletError('')
  }

  const removeScannedPackage = (
    palletId: string,
    packageId: string,
  ) => {
    setPallets((previous) => previous.map((pallet) => {
      if (pallet.id !== palletId) return pallet

      const captured = pallet.scannedPackages.find(
        (item) => item.localId === packageId,
      )

      if (!captured) return pallet

      const remainingPackages = pallet.scannedPackages.filter(
        (item) => item.localId !== packageId,
      )
      const parts = pallet.parts.map((part) => {
        if (part.id !== captured.partId) return part

        const nextQuantity = captured.quantity === null
          ? Number(part.quantity) || 0
          : Math.max(0, (Number(part.quantity) || 0) - captured.quantity)
        const nextPackages = Math.max(0, (Number(part.packages) || 0) - 1)

        return {
          ...part,
          quantity: nextQuantity > 0 ? String(nextQuantity) : '',
          packages: nextPackages > 0 ? String(nextPackages) : '',
        }
      })

      return {
        ...pallet,
        parts,
        scannedPackages: remainingPackages,
      }
    }))
  }

  const removePart = (
    palletId:
      string,

    partId:
      string,
  ) => {
    setPallets(
      (
        previous,
      ) =>
        previous.map(
          (
            pallet,
          ) => {
            if (
              pallet.id !==
              palletId ||
              pallet.parts
                .length ===
                1
            ) {
              return pallet
            }

            return {
              ...pallet,

              parts:
                pallet.parts
                  .filter(
                    (
                      part,
                    ) =>
                      part.id !==
                      partId,
                  ),

              scannedPackages:
                pallet.scannedPackages.filter(
                  (item) => item.partId !== partId,
                ),
            }
          },
        ),
    )
  }

  const updatePart = (
    palletId:
      string,

    partId:
      string,

    field:
      | 'partNumber'
      | 'quantity'
      | 'boxes'
      | 'packages'
      | 'palletReference',

    value:
      string,
  ) => {
    setPallets(
      (
        previous,
      ) =>
        previous.map(
          (
            pallet,
          ) => {
            if (
              pallet.id !==
              palletId
            ) {
              return pallet
            }

            return {
              ...pallet,

              parts:
                pallet.parts.map(
                  (
                    part,
                  ) =>
                    part.id ===
                    partId
                      ? {
                          ...part,

                          [field]:
                            value,
                        }
                      : part,
                ),
            }
          },
        ),
    )

    setPalletError(
      '',
    )
  }

  const handlePhotoUpload = (
    palletId:
      string,

    photoType:
      PhotoType,

    files:
      FileList | null,
  ) => {
    if (
      !files ||
      files.length ===
        0
    ) {
      return
    }

    const newPhotos =
      Array.from(
        files,
      ).map(
        (
          file,
        ): PalletPhoto => ({
          id:
            createId(),

          file,

          preview:
            URL.createObjectURL(
              file,
            ),
        }),
      )

    setPallets(
      (
        previous,
      ) =>
        previous.map(
          (
            pallet,
          ) =>
            pallet.id ===
            palletId
              ? {
                  ...pallet,

                  photos: {
                    ...pallet.photos,

                    [photoType]: [
                      ...pallet
                        .photos[
                        photoType
                      ],

                      ...newPhotos,
                    ],
                  },
                }
              : pallet,
        ),
    )

    setPalletError(
      '',
    )
  }

  const removePhoto = (
    palletId:
      string,

    photoType:
      PhotoType,

    photoId:
      string,
  ) => {
    setPallets(
      (
        previous,
      ) =>
        previous.map(
          (
            pallet,
          ) => {
            if (
              pallet.id !==
              palletId
            ) {
              return pallet
            }

            const photo =
              pallet
                .photos[
                photoType
              ]
                .find(
                  (
                    item,
                  ) =>
                    item.id ===
                    photoId,
                )

            if (
              photo
            ) {
              URL.revokeObjectURL(
                photo.preview,
              )
            }

            return {
              ...pallet,

              photos: {
                ...pallet.photos,

                [photoType]:
                  pallet
                    .photos[
                    photoType
                  ]
                    .filter(
                      (
                        item,
                      ) =>
                        item.id !==
                        photoId,
                    ),
              },
            }
          },
        ),
    )
  }

  const validateArrival =
    () => {
      if (
        !formData
          .carrier
          .trim()
      ) {
        setGeneralError(
          'Selecciona un carrier.',
        )

        return false
      }

      if (
        formData.carrier ===
          'Other' &&
        !formData
          .otherCarrier
          .trim()
      ) {
        setGeneralError(
          'Escribe el nombre del carrier.',
        )

        return false
      }

      if (
        !formData
          .trailer
          .trim()
      ) {
        setGeneralError(
          'Captura el número de trailer o caja.',
        )

        return false
      }

      setGeneralError(
        '',
      )

      return true
    }

  const validatePallet = (
    pallet:
      PalletItem,
  ) => {
    for (
      const part of
      pallet.parts
    ) {
      if (
        !part
          .partNumber
          .trim()
      ) {
        setPalletError(
          'Debes capturar todos los números de parte.',
        )

        return false
      }

      if (
        !part.quantity ||
        Number(
          part.quantity,
        ) <=
          0
      ) {
        setPalletError(
          'Todas las cantidades deben ser mayores a cero.',
        )

        return false
      }
    }

    if (
      pallet.photos
        .packingList
        .length ===
      0
    ) {
      setPalletError(
        'Debes agregar al menos una foto del Packing List.',
      )

      return false
    }

    if (
      pallet.photos
        .palletLabel
        .length ===
      0
    ) {
      setPalletError(
        'Debes agregar al menos una foto de la Etiqueta de Tarima.',
      )

      return false
    }

    if (
      pallet.photos
        .palletPhoto
        .length ===
      0
    ) {
      setPalletError(
        'Debes agregar al menos una Foto de Tarima.',
      )

      return false
    }

    if (
      pallet.photos.bol
        .length ===
      0
    ) {
      setPalletError(
        'Debes agregar al menos una foto del BOL.',
      )

      return false
    }

    if (
      pallet.damaged ===
        'Sí' &&
      pallet.photos
        .damage.length ===
        0
    ) {
      setPalletError(
        'El pallet presenta daños. Debes agregar al menos una fotografía como evidencia del daño.',
      )

      return false
    }

    setPalletError(
      '',
    )

    return true
  }

const addPallet =
  () => {
    const newPallet =
      createPallet()

    setPallets(
      (
        previous,
      ) => [
        ...previous,
        newPallet,
      ],
    )

    setCurrentPalletIndex(
      pallets.length,
    )

    setPalletError(
      '',
    )
  }

const removeCurrentPallet =
  () => {
    if (
      pallets.length ===
      1
    ) {
      setPalletError(
        'La recepción debe conservar al menos un pallet.',
      )

      return
    }

    const palletToRemove =
      pallets[
        currentPalletIndex
      ]

    palletToRemove.photos
      .packingList
      .forEach(
        (
          photo,
        ) =>
          URL.revokeObjectURL(
            photo.preview,
          ),
      )

    palletToRemove.photos
      .palletLabel
      .forEach(
        (
          photo,
        ) =>
          URL.revokeObjectURL(
            photo.preview,
          ),
      )

    palletToRemove.photos
      .palletPhoto
      .forEach(
        (
          photo,
        ) =>
          URL.revokeObjectURL(
            photo.preview,
          ),
      )

    palletToRemove.photos.bol
      .forEach(
        (
          photo,
        ) =>
          URL.revokeObjectURL(
            photo.preview,
          ),
      )

    palletToRemove.photos.damage
      .forEach(
        (
          photo,
        ) =>
          URL.revokeObjectURL(
            photo.preview,
          ),
      )

    setPallets(
      (
        previous,
      ) =>
        previous.filter(
          (
            pallet,
          ) =>
            pallet.id !==
            palletToRemove.id,
        ),
    )

    setCurrentPalletIndex(
      (
        previous,
      ) =>
        previous ===
        0
          ? 0
          : previous -
            1,
    )

    setPalletError(
      '',
    )
  }

const completeCurrentPallet =
  () => {
    if (
      !currentPallet ||
      !validatePallet(
        currentPallet,
      )
    ) {
      return
    }

    setPallets(
      (
        previous,
      ) =>
        previous.map(
          (
            pallet,
          ) =>
            pallet.id ===
            currentPallet.id
              ? {
                  ...pallet,
                  completed:
                    true,
                }
              : pallet,
        ),
    )

    if (
      currentPalletIndex <
      pallets.length -
        1
    ) {
      setCurrentPalletIndex(
        (
          previous,
        ) =>
          previous +
          1,
      )
    }

    setPalletError(
      '',
    )
  }
  const completedPallets=
    pallets.filter(
      (
        pallet,
      ) =>
        pallet.completed,
    ).length

  const totalPartNumbers =
    pallets.reduce(
      (
        total,
        pallet,
      ) =>
        total +
        pallet.parts
          .length,
      0,
    )

  const totalPackages =
    pallets.reduce(
      (
        total,
        pallet,
      ) =>
        total +
        pallet.parts
          .reduce(
            (
              subtotal,
              part,
            ) =>
              subtotal +
              (
                Number(
                  part.packages,
                ) ||
                0
              ),
            0,
          ),
      0,
    )

  const totalEvidence =
    pallets.reduce(
      (
        total,
        pallet,
      ) =>
        total +
        pallet.photos
          .packingList
          .length +
        pallet.photos
          .palletLabel
          .length +
        pallet.photos
          .palletPhoto
          .length +
        pallet.photos.bol
          .length +
        pallet.photos
          .damage.length,
      0,
    )

  const hasDamage =
    pallets.some(
      (
        pallet,
      ) =>
        pallet.damaged ===
        'Sí',
    )

  const updateVerification = (
    field:
      keyof VerificationState,

    checked:
      boolean,
  ) => {
    setVerification(
      (
        previous,
      ) => ({
        ...previous,

        [field]:
          checked,
      }),
    )
  }

  const goNext =
    () => {
      if (
        currentStep ===
        1
      ) {
        if (
          !validateArrival()
        ) {
          return
        }

        setCurrentStep(
          2,
        )

        return
      }

      if (
        currentStep ===
        3
      ) {
        const allChecked =
          Object.values(
            verification,
          ).every(
            Boolean,
          )

        if (
          !allChecked
        ) {
          setSaveError(
            'Debes completar todas las verificaciones.',
          )

          return
        }

        setSaveError(
          '',
        )

        setCurrentStep(
          4,
        )
      }
    }

  const goBack =
    () => {
      if (
        currentStep >
        1
      ) {
        setCurrentStep(
          (
            previous,
          ) =>
            previous -
            1,
        )

        return
      }

      navigate(
        '/receiving',
      )
    }

  const completeReception =
    async () => {
      if (
        isSaving
      ) {
        return
      }

      if (
        completedPallets !==
        pallets.length
      ) {
        setSaveError(
          'Todos los pallets deben estar completos antes de guardar la recepción.',
        )

        return
      }

      try {
        setIsSaving(
          true,
        )

        setSaveError(
          '',
        )

        const reception = await createReception({
          carrier:
            formData.carrier,

          otherCarrier:
            formData.otherCarrier,

          trailer:
            formData.trailer,

          palletCount:
            String(
              pallets.length,
            ),

          seal:
            formData.seal,

          receptionDate:
            formData.receptionDate,

          receptionTime:
            formData.receptionTime,

          pallets,
        })

        await createNormalReceptionPackages(
          reception.id,
          pallets.flatMap((pallet, palletIndex) =>
            pallet.scannedPackages.map((item) => ({
              partNumber: item.partNumber,
              purchaseOrder: item.purchaseOrder,
              quantity: item.quantity,
              supplierCode: item.supplierCode,
              supplierPackageId: item.supplierPackageId,
              supplierPackageType: item.supplierPackageType,
              rawCodes: item.rawCodes,
              palletNumber: palletIndex + 1,
            })),
          ),
        )

        window.localStorage.removeItem(
          DRAFT_STORAGE_KEY,
        )

        alert(
          'Recepción y paquetes guardados correctamente.',
        )

        navigate(
          `/operations/receiving/${reception.id}`,
        )
      } catch (
        error
      ) {
        console.error(
          error,
        )

        setSaveError(
          error instanceof
            Error
            ? error.message
            : 'Ocurrió un error inesperado.',
        )
      } finally {
        setIsSaving(
          false,
        )
      }
    }

  return (
    <div className="space-y-8">

      {scannerPalletId && (
        <PackageLabelScanner
          onClose={() => setScannerPalletId(null)}
          onSave={(item) => addScannedPackage(scannerPalletId, item)}
        />
      )}

      <section>
        <button
          type="button"
          onClick={() =>
            navigate(
              '/receiving',
            )
          }
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft
            size={
              18
            }
          />

          Volver a recepción
        </button>

        <p className="mt-6 text-sm text-slate-600 dark:text-slate-400">
          Registro de entrada
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
          Nueva recepción
        </h1>

        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Registra y verifica el material recibido antes de ingresarlo al inventario.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {steps.map(
          (
            step,
          ) => {
            const Icon =
              step.icon

            const active =
              step.id ===
              currentStep

            const completed =
              step.id <
              currentStep

            return (
              <div
                key={
                  step.id
                }
                className={[
                  'flex items-center gap-3 rounded-xl border px-4 py-3',

                  active
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : completed
                      ? 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800'
                      : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950',
                ].join(
                  ' ',
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-emerald-600 dark:bg-slate-800 dark:text-emerald-400">
                  {completed ? (
                    <Check
                      size={
                        18
                      }
                    />
                  ) : (
                    <Icon
                      size={
                        18
                      }
                    />
                  )}
                </div>

                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-500">
                    Paso{' '}
                    {
                      step.id
                    }
                  </p>

                  <p className="text-sm font-semibold text-slate-950 dark:text-white sm:text-base">
                    {
                      step.name
                    }
                  </p>
                </div>
              </div>
            )
          },
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-6">

        {currentStep ===
          1 && (
          <div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              Datos de llegada
            </h2>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">

              <FormField label="Carrier">
                <select
                  value={
                    formData.carrier
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'carrier',
                      event.target.value,
                    )
                  }
                  className="input-style"
                >
                  <option value="XPO">
                    XPO
                  </option>

                  <option value="CENTRAL">
                    CENTRAL
                  </option>

                  <option value="MTY">
                    MTY
                  </option>

                  <option value="IZI">
                    IZI
                  </option>

                  <option value="UPS">
                    UPS
                  </option>

                  <option value="Other">
                    Other
                  </option>
                </select>
              </FormField>

              {formData.carrier ===
                'Other' && (
                <FormField label="Nombre del carrier">
                  <input
                    value={
                      formData.otherCarrier
                    }
                    onChange={(
                      event,
                    ) =>
                      updateField(
                        'otherCarrier',
                        event.target.value,
                      )
                    }
                    className="input-style"
                  />
                </FormField>
              )}

              <FormField label="Trailer / Caja">
                <input
                  value={
                    formData.trailer
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'trailer',
                      event.target.value,
                    )
                  }
                  className="input-style"
                />
              </FormField>


              <FormField label="Fecha">
                <input
                  type="date"
                  value={
                    formData.receptionDate
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'receptionDate',
                      event.target.value,
                    )
                  }
                  className="input-style"
                />
              </FormField>

              <FormField label="Hora">
                <input
                  type="time"
                  value={
                    formData.receptionTime
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'receptionTime',
                      event.target.value,
                    )
                  }
                  className="input-style"
                />
              </FormField>

              <FormField label="Sello">
                <input
                  value={
                    formData.seal
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'seal',
                      event.target.value,
                    )
                  }
                  className="input-style"
                />
              </FormField>

            </div>

            {generalError && (
              <ErrorMessage
                message={
                  generalError
                }
              />
            )}
          </div>
        )}

        {currentStep ===
          2 &&
          currentPallet && (
          <div>
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <p className="text-sm font-semibold text-blue-800 dark:text-emerald-400">
      Pallet{' '}
      {currentPalletIndex +
        1}{' '}
      de{' '}
      {
        pallets.length
      }
    </p>

    <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
      Registrar pallet
    </h2>

    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
      El total se calcula automáticamente conforme agregas o eliminas pallets.
    </p>
  </div>

  <div className="flex flex-wrap gap-2">
    <button
      type="button"
      onClick={
        addPallet
      }
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950"
    >
      <Plus
        size={
          17
        }
      />

      Agregar pallet
    </button>

    <button
      type="button"
      disabled={
        pallets.length ===
        1
      }
      onClick={
        removeCurrentPallet
      }
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/40 px-4 py-2.5 text-sm font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
    >
      <Trash2
        size={
          17
        }
      />

      Eliminar pallet
    </button>
  </div>
</div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">

              <FormField label="¿Presenta daños?">
                <select
                  value={
                    currentPallet.damaged
                  }
                  onChange={(
                    event,
                  ) =>
                    updatePallet(
                      currentPallet.id,
                      'damaged',
                      event.target.value,
                    )
                  }
                  className="input-style"
                >
                  <option value="No">
                    No
                  </option>

                  <option value="Sí">
                    Sí
                  </option>
                </select>
              </FormField>

              <FormField label="Observaciones">
                <input
                  value={
                    currentPallet.notes
                  }
                  onChange={(
                    event,
                  ) =>
                    updatePallet(
                      currentPallet.id,
                      'notes',
                      event.target.value,
                    )
                  }
                  className="input-style"
                />
              </FormField>

            </div>

            {currentPallet.damaged ===
              'Sí' && (
              <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/5 p-5">
                <div className="flex items-center gap-3">
                  <TriangleAlert
                    size={
                      21
                    }
                    className="text-red-400"
                  />

                  <div>
                    <h3 className="font-semibold text-slate-950 dark:text-white">
                      Evidencia de daños
                    </h3>

                    <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                      El material presenta daños. Agrega al menos una fotografía como evidencia.
                    </p>
                  </div>
                </div>

                <div className="mt-5">
                  <MultiPhotoBox
                    title="Fotos de daños"
                    photos={
                      currentPallet
                        .photos
                        .damage
                    }
                    required
                    onFiles={(
                      files,
                    ) =>
                      handlePhotoUpload(
                        currentPallet.id,
                        'damage',
                        files,
                      )
                    }
                    onRemove={(
                      photoId,
                    ) =>
                      removePhoto(
                        currentPallet.id,
                        'damage',
                        photoId,
                      )
                    }
                  />
                </div>
              </div>
            )}

            <div className="mt-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-950 dark:text-white">
                    Números de parte
                  </h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
                    Escanea cada label para capturar la parte, cantidad y datos de rastreo.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setScannerPalletId(currentPallet.id)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  <ScanBarcode size={19} />
                  Escanear label
                </button>
              </div>

              {currentPallet.scannedPackages.length > 0 && (
                <div className="mt-4 space-y-2">
                  {currentPallet.scannedPackages.map((item, index) => (
                    <article
                      key={item.localId}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 text-sm font-bold text-emerald-500">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-bold text-slate-950 dark:text-white">
                          {item.partNumber}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-600 dark:text-slate-400">
                          {item.quantity !== null ? `Cantidad ${item.quantity}` : 'Cantidad pendiente'}
                          {item.purchaseOrder ? ` · PO ${item.purchaseOrder}` : ''}
                          {item.supplierPackageId
                            ? ` · ${item.supplierPackageType || ''}${item.supplierPackageId}`
                            : ''}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeScannedPackage(currentPallet.id, item.localId)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-500"
                        aria-label={`Eliminar label ${item.partNumber}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </article>
                  ))}
                </div>
              )}

              <div className="mt-4 space-y-4">
                {currentPallet.parts.map(
                  (
                    part,
                    index,
                  ) => (
                    <div
                      key={
                        part.id
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex justify-between">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          Parte{' '}
                          {index +
                            1}
                        </p>

                        {currentPallet
                          .parts
                          .length >
                          1 && (
                          <button
                            type="button"
                            onClick={() =>
                              removePart(
                                currentPallet.id,
                                part.id,
                              )
                            }
                            className="text-red-400"
                          >
                            <Trash2
                              size={
                                16
                              }
                            />
                          </button>
                        )}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(220px,0.9fr)_minmax(130px,0.55fr)]">

                        <FormField label="Número de parte">
                          <input
                            value={
                              part.partNumber
                            }
                            onChange={(
                              event,
                            ) =>
                              updatePart(
                                currentPallet.id,
                                part.id,
                                'partNumber',
                                event.target.value,
                              )
                            }
                            className="input-style"
                          />
                        </FormField>

                        <FormField label="Cantidad">
                          <input
                            type="number"
                            min="1"
                            value={
                              part.quantity
                            }
                            onChange={(
                              event,
                            ) =>
                              updatePart(
                                currentPallet.id,
                                part.id,
                                'quantity',
                                event.target.value,
                              )
                            }
                            className="input-style"
                          />
                        </FormField>

                        <FormField label="Cajas / bultos">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={
                                part.boxes
                              }
                              onChange={(
                                event,
                              ) =>
                                updatePart(
                                  currentPallet.id,
                                  part.id,
                                  'boxes',
                                  event.target.value,
                                )
                              }
                              placeholder="Cajas"
                              className="input-style min-w-0 text-center"
                            />

                            <span className="text-lg font-bold text-slate-600 dark:text-slate-500">
                              /
                            </span>

                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={
                                part.packages
                              }
                              onChange={(
                                event,
                              ) =>
                                updatePart(
                                  currentPallet.id,
                                  part.id,
                                  'packages',
                                  event.target.value,
                                )
                              }
                              placeholder="Bultos"
                              className="input-style min-w-0 text-center"
                            />
                          </div>
                        </FormField>

                        <FormField label="# de Tarima">
                          <input
                            value={
                              part.palletReference
                            }
                            onChange={(
                              event,
                            ) =>
                              updatePart(
                                currentPallet.id,
                                part.id,
                                'palletReference',
                                event.target.value,
                              )
                            }
                            placeholder="#"
                            className="input-style text-center"
                          />
                        </FormField>

                      </div>
                    </div>
                  ),
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  addPart(
                    currentPallet.id,
                  )
                }
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-800/30 px-3 py-2 text-xs font-semibold text-blue-800 transition hover:bg-blue-800/5 dark:border-emerald-500/30 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <Plus
                  size={
                    15
                  }
                />

                Agregar número de parte
              </button>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                Evidencias
              </h3>

              <p className="mt-2 text-sm text-slate-600 dark:text-slate-500">
                Debes agregar al menos una foto por categoría. Puedes agregar fotos adicionales cuando sea necesario.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">

                <MultiPhotoBox
                  title="Packing List"
                  photos={
                    currentPallet
                      .photos
                      .packingList
                  }
                  required
                  onFiles={(
                    files,
                  ) =>
                    handlePhotoUpload(
                      currentPallet.id,
                      'packingList',
                      files,
                    )
                  }
                  onRemove={(
                    photoId,
                  ) =>
                    removePhoto(
                      currentPallet.id,
                      'packingList',
                      photoId,
                    )
                  }
                />

                <MultiPhotoBox
                  title="Etiqueta de Tarima"
                  photos={
                    currentPallet
                      .photos
                      .palletLabel
                  }
                  required
                  onFiles={(
                    files,
                  ) =>
                    handlePhotoUpload(
                      currentPallet.id,
                      'palletLabel',
                      files,
                    )
                  }
                  onRemove={(
                    photoId,
                  ) =>
                    removePhoto(
                      currentPallet.id,
                      'palletLabel',
                      photoId,
                    )
                  }
                />

                <MultiPhotoBox
                  title="Foto de Tarima"
                  photos={
                    currentPallet
                      .photos
                      .palletPhoto
                  }
                  required
                  onFiles={(
                    files,
                  ) =>
                    handlePhotoUpload(
                      currentPallet.id,
                      'palletPhoto',
                      files,
                    )
                  }
                  onRemove={(
                    photoId,
                  ) =>
                    removePhoto(
                      currentPallet.id,
                      'palletPhoto',
                      photoId,
                    )
                  }
                />

                <MultiPhotoBox
                  title="BOL"
                  photos={
                    currentPallet
                      .photos
                      .bol
                  }
                  required
                  onFiles={(
                    files,
                  ) =>
                    handlePhotoUpload(
                      currentPallet.id,
                      'bol',
                      files,
                    )
                  }
                  onRemove={(
                    photoId,
                  ) =>
                    removePhoto(
                      currentPallet.id,
                      'bol',
                      photoId,
                    )
                  }
                />

              </div>
            </div>

            {palletError && (
              <ErrorMessage
                message={
                  palletError
                }
              />
            )}

<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <button
    type="button"
    disabled={currentPalletIndex === 0}
    onClick={() =>
      setCurrentPalletIndex((previous) => previous - 1)
    }
    className="w-full rounded-xl border border-slate-300 px-5 py-3 text-sm text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 sm:w-auto"
  >
    Pallet anterior
  </button>

  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
    <button
      type="button"
      onClick={completeCurrentPallet}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500 px-5 py-3 font-semibold text-emerald-700 dark:text-emerald-400 sm:w-auto"
    >
      <Check size={18} />

      {currentPallet.completed
        ? 'Pallet guardado'
        : 'Guardar pallet'}
    </button>

    <button
      type="button"
      disabled={completedPallets !== pallets.length}
      onClick={() => {
        if (completedPallets !== pallets.length) {
          setPalletError(
            'Debes guardar todos los pallets antes de continuar a verificación.',
          )
          return
        }

        setPalletError('')
        setCurrentStep(3)
      }}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
    >
      Continuar a verificación
      <ArrowRight size={18} />
    </button>
  </div>
</div>

          </div>
        )}

        {currentStep === 3 && (
          <div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              Verificación
            </h2>

            <p className="mt-2 text-sm text-slate-600 dark:text-slate-500">
              Confirma la información antes de cerrar la recepción.
            </p>

            <div className="mt-6 space-y-4">

              <VerificationCheckbox
                label="Packing Lists revisados"
                checked={
                  verification
                    .packingListsReviewed
                }
                onChange={(
                  checked,
                ) =>
                  updateVerification(
                    'packingListsReviewed',
                    checked,
                  )
                }
              />

              <VerificationCheckbox
                label="Números de parte verificados"
                checked={
                  verification
                    .partNumbersVerified
                }
                onChange={(
                  checked,
                ) =>
                  updateVerification(
                    'partNumbersVerified',
                    checked,
                  )
                }
              />

              <VerificationCheckbox
                label="Cantidades físicas confirmadas"
                checked={
                  verification
                    .physicalQuantitiesConfirmed
                }
                onChange={(
                  checked,
                ) =>
                  updateVerification(
                    'physicalQuantitiesConfirmed',
                    checked,
                  )
                }
              />

              <VerificationCheckbox
                label="Daños documentados si existen"
                checked={
                  verification
                    .damagesDocumented
                }
                onChange={(
                  checked,
                ) =>
                  updateVerification(
                    'damagesDocumented',
                    checked,
                  )
                }
              />

              <VerificationCheckbox
                label="Material listo para ingresar"
                checked={
                  verification
                    .materialReady
                }
                onChange={(
                  checked,
                ) =>
                  updateVerification(
                    'materialReady',
                    checked,
                  )
                }
              />

            </div>
          </div>
        )}

        {currentStep ===
          4 && (
          <div>
            <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
              Resumen de recepción
            </h2>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">

              <SummaryCard
                title="Datos de llegada"
              >
                <SummaryRow
                  label="Carrier"
                  value={
                    formData.carrier ===
                    'Other'
                      ? formData.otherCarrier
                      : formData.carrier
                  }
                />

                <SummaryRow
                  label="Trailer"
                  value={
                    formData.trailer
                  }
                />

<SummaryRow
  label="Pallets registrados"
  value={String(
    pallets.length,
  )}
/>

                <SummaryRow
                  label="Fecha"
                  value={
                    formData.receptionDate
                  }
                />
              </SummaryCard>

              <SummaryCard
                title="Resumen de material"
              >
                <SummaryRow
                  label="Pallets"
                  value={String(
                    pallets.length,
                  )}
                />

                <SummaryRow
                  label="Números de parte"
                  value={String(
                    totalPartNumbers,
                  )}
                />

                <SummaryRow
                  label="Cajas / bultos"
                  value={String(
                    totalPackages,
                  )}
                />

                <SummaryRow
                  label="Material con daños"
                  value={
                    hasDamage
                      ? 'Sí'
                      : 'No'
                  }
                />

                <SummaryRow
                  label="Total de evidencias"
                  value={String(
                    totalEvidence,
                  )}
                />
              </SummaryCard>

            </div>

            {saveError && (
              <ErrorMessage
                message={
                  saveError
                }
              />
            )}
          </div>
        )}

        {currentStep !==
          2 && (
          <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={
                goBack
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300 sm:w-auto"
            >
              <ArrowLeft
                size={
                  18
                }
              />

              Atrás
            </button>

            {currentStep <
            4 ? (
              <button
                type="button"
                onClick={
                  goNext
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 sm:w-auto"
              >
                Continuar

                <ArrowRight
                  size={
                    18
                  }
                />
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  isSaving
                }
                onClick={() =>
                  void completeReception()
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50 sm:w-auto"
              >
                <Check
                  size={
                    18
                  }
                />

                {isSaving
                  ? 'Guardando...'
                  : 'Completar recepción'}
              </button>
            )}

          </div>
        )}

      </section>

      <style>
        {`
          .input-style {
            width: 100%;
            border-radius: 0.75rem;
            border: 1px solid var(--ggg-border-strong);
            background-color: var(--ggg-input);
            padding: 0.75rem 1rem;
            color: var(--ggg-text);
            outline: none;
            transition:
              border-color 160ms ease,
              box-shadow 160ms ease,
              background-color 160ms ease,
              color 160ms ease;
          }

          .input-style::placeholder {
            color: var(--ggg-text-muted);
          }

          .input-style:focus {
            border-color: var(--ggg-primary);
            box-shadow: 0 0 0 3px var(--ggg-primary-soft);
          }
        `}
      </style>
  </div>
 )
}

function MultiPhotoBox({
  title,
  photos,
  required,
  onFiles,
  onRemove,
}: {
  title:
    string

  photos:
    PalletPhoto[]

  required?:
    boolean

  onFiles:
    (
      files:
        FileList | null,
    ) => void

  onRemove:
    (
      photoId:
        string,
    ) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">

      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-950 dark:text-white">
            {title}
          </h4>

          <p className="mt-1 text-xs text-slate-600 dark:text-slate-500">
            {photos.length}{' '}
            foto(s) agregada(s)
          </p>

          {title ===
            'Foto de Tarima' && (
            <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-500">
              * QUE CUATRO ESQUINAS Y CONO VERDE SEAN VISIBLE *
            </p>
          )}
        </div>

        {required && (
          <span className="text-xs font-semibold text-red-700 dark:text-red-400">
            Obligatoria
          </span>
        )}
      </div>

      {photos.length >
        0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map(
            (
              photo,
              index,
            ) => (
              <div
                key={
                  photo.id
                }
                className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
              >
                <img
                  src={
                    photo.preview
                  }
                  alt={`${title} ${index + 1}`}
                  className="h-32 w-full object-cover"
                />

                <button
                  type="button"
                  onClick={() =>
                    onRemove(
                      photo.id,
                    )
                  }
                  className="absolute right-2 top-2 rounded-lg bg-black/80 p-2 text-red-300 transition hover:bg-black/90 hover:text-red-200"
                >
                  <Trash2
                    size={
                      15
                    }
                  />
                </button>

                <span className="absolute bottom-2 left-2 rounded bg-black/80 px-2 py-1 text-xs text-white">
                  Foto{' '}
                  {index +
                    1}
                </span>
              </div>
            ),
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">

        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(
              event,
            ) => {
              onFiles(
                event.target
                  .files,
              )

              event.target.value =
                ''
            }}
          />

          <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950">
            <Camera
              size={
                15
              }
            />

            Tomar foto
          </span>
        </label>

        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(
              event,
            ) => {
              onFiles(
                event.target
                  .files,
              )

              event.target.value =
                ''
            }}
          />

          <span className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-300">
            <ImagePlus
              size={
                15
              }
            />

            Agregar desde galería
          </span>
        </label>

        {photos.length >
          0 && (
          <span className="flex items-center text-xs font-semibold text-blue-800 dark:text-emerald-400">
            + Puedes agregar más fotos
          </span>
        )}

      </div>
    </div>
  )
}

function FormField({
  label,
  children,
}: {
  label:
    string

  children:
    React.ReactNode
}) {
  return (
    <label className="space-y-2">

      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </span>

      {children}

    </label>
  )
}

function VerificationCheckbox({
  label,
  checked,
  onChange,
}: {
  label:
    string

  checked:
    boolean

  onChange:
    (
      checked:
        boolean,
    ) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950">

      <input
        type="checkbox"
        checked={
          checked
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target
              .checked,
          )
        }
        className="h-4 w-4 accent-emerald-500"
      />

      <span className="text-sm text-slate-700 dark:text-slate-300">
        {label}
      </span>

    </label>
  )
}

function SummaryCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
      <h3 className="font-semibold text-slate-950 dark:text-white">
        {title}
      </h3>

      <div className="mt-5 space-y-3">
        {children}
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-700 dark:text-slate-400">
        {label}
      </span>

      <span className="text-right text-sm font-medium text-slate-950 dark:text-slate-100">
        {value || 'No capturado'}
      </span>
    </div>
  )
}
function ErrorMessage({
  message,
}: {
  message:
    string
}) {
  return (
    <div className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      {message}
    </div>
  )
}
