import { supabase } from '../lib/supabase'

type PartInput = {
  partNumber: string
  quantity: string
  boxes: string
  packages: string
  palletReference: string
}

type PhotoInput = {
  file: File
  preview: string
}

type PalletInput = {
  damaged: string
  notes: string

  parts: PartInput[]

  documents: {
    packingListReference: string
    invoice: string
    documentationComplete: string
  }

  photos: {
    packingList: PhotoInput[]
    palletLabel: PhotoInput[]
    palletPhoto: PhotoInput[]
    bol: PhotoInput[]
    damage: PhotoInput[]
  }

  completed: boolean
}

type ReceptionInput = {
  carrier: string
  otherCarrier: string
  trailer: string
  palletCount: string
  seal: string
  receptionDate: string
  receptionTime: string
  pallets: PalletInput[]
}

export type PhotoType =
  | 'packing_list'
  | 'pallet_label'
  | 'pallet_photo'
  | 'bol'
  | 'damage'

export type ReceptionPhoto = {
  id: string
  pallet_id: string
  photo_type: PhotoType
  storage_path: string
  signed_url: string | null
  created_at: string
}

export type ReceptionPart = {
  id: string
  pallet_id: string
  part_number: string
  quantity: number
  boxes: number | null
  packages: number | null
  pallet_ref: string | null
  created_at: string
}

export type ReceptionPallet = {
  id: string
  reception_id: string
  pallet_number: number
  packing_list_reference: string | null
  invoice: string | null
  damaged: boolean
  notes: string | null
  documentation_complete: boolean
  completed: boolean
  created_at: string
  parts: ReceptionPart[]
  photos: ReceptionPhoto[]
}

export type ReceptionDetail = {
  id: string
  reception_number: string
  carrier: string
  other_carrier: string | null
  trailer: string
  pallet_count: number
  seal: string | null
  reception_date: string
  reception_time: string
  status:
    | 'in_progress'
    | 'completed'
    | 'issue'
  created_at: string
  updated_at: string
  pallets: ReceptionPallet[]
}

export type UpdateReceptionInput = {
  carrier: string
  otherCarrier: string
  trailer: string
  seal: string
  receptionDate: string
  receptionTime: string
}

export type UpdatePalletPartInput = {
  partNumber: string
  quantity: string
  boxes: string
  packages: string
  palletReference: string
}

export type ReplacementPhotos = {
  packing_list?: File | null
  pallet_label?: File | null
  pallet_photo?: File | null
  bol?: File | null
  damage?: File | null
}

export type UpdatePalletInput = {
  packingListReference: string
  invoice: string
  damaged: boolean
  notes: string
  documentationComplete: boolean
  parts: UpdatePalletPartInput[]
  replacementPhotos?: ReplacementPhotos
}

function getFileExtension(file: File) {
  const extension =
    file.name
      .split('.')
      .pop()

  return extension || 'jpg'
}

function createUniqueFileName(
  photoType: PhotoType,
  file: File,
  index: number,
) {
  const extension =
    getFileExtension(file)

  const uniquePart =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`

  return `${photoType}-${index + 1}-${uniquePart}.${extension}`
}

async function uploadPalletPhoto(
  receptionId: string,
  palletId: string,
  photoType: PhotoType,
  file: File,
  index = 0,
) {
  const fileName =
    createUniqueFileName(
      photoType,
      file,
      index,
    )

  const storagePath = [
    receptionId,
    palletId,
    photoType,
    fileName,
  ].join('/')

  const {
    error: uploadError,
  } = await supabase.storage
    .from('pallet-evidence')
    .upload(
      storagePath,
      file,
      {
        upsert: false,
      },
    )

  if (uploadError) {
    throw new Error(
      `Error subiendo ${photoType}: ${uploadError.message}`,
    )
  }

  const {
    error: photoRecordError,
  } = await supabase
    .from('pallet_photos')
    .insert({
      pallet_id:
        palletId,

      photo_type:
        photoType,

      storage_path:
        storagePath,
    })

  if (photoRecordError) {
    throw new Error(
      `Error guardando referencia de ${photoType}: ${photoRecordError.message}`,
    )
  }
}

async function uploadPhotoCollection(
  receptionId: string,
  palletId: string,
  photoType: PhotoType,
  photos: PhotoInput[],
) {
  for (
    let index = 0;
    index < photos.length;
    index += 1
  ) {
    await uploadPalletPhoto(
      receptionId,
      palletId,
      photoType,
      photos[index].file,
      index,
    )
  }
}

type CreateReceptionRpcResult = {
  reception_id: string
  pallets: Array<{
    pallet_number: number
    pallet_id: string
  }>
}

export async function createReception(
  input: ReceptionInput,
) {
  const carrierName =
    input.carrier === 'Other'
      ? input.otherCarrier.trim()
      : input.carrier.trim()

  const receptionPayload = {
    carrier: carrierName,

    other_carrier:
      input.carrier === 'Other'
        ? input.otherCarrier.trim()
        : null,

    trailer:
      input.trailer.trim(),

    seal:
      input.seal.trim() || null,

    reception_date:
      input.receptionDate,

    reception_time:
      input.receptionTime,

    status:
      'completed',
  }

  const palletsPayload =
    input.pallets.map(
      (pallet) => ({
        packing_list_reference:
          pallet.documents
            .packingListReference
            .trim() ||
          null,

        invoice:
          pallet.documents
            .invoice
            .trim() ||
          null,

        damaged:
          pallet.damaged === 'Sí',

        notes:
          pallet.notes.trim() ||
          null,

        documentation_complete:
          pallet.documents
            .documentationComplete ===
          'Sí',

        completed:
          pallet.completed,

        parts:
          pallet.parts.map(
            (part) => ({
              part_number:
                part.partNumber.trim(),

              quantity:
                part.quantity.trim(),

              packages:
                part.packages.trim(),

              pallet_ref:
                part.palletReference
                  .trim() ||
                null,
            }),
          ),
      }),
    )

  const {
    data,
    error,
  } = await supabase.rpc(
    'create_complete_reception',
    {
      p_reception:
        receptionPayload,

      p_pallets:
        palletsPayload,
    },
  )

  if (error) {
    throw new Error(
      `Error guardando recepción: ${error.message}`,
    )
  }

  const result =
    data as CreateReceptionRpcResult

  if (
    !result?.reception_id ||
    !Array.isArray(
      result.pallets,
    )
  ) {
    throw new Error(
      'Supabase no devolvió correctamente la recepción guardada.',
    )
  }

  const photoWarnings:
    string[] = []

  for (
    let palletIndex = 0;
    palletIndex <
    input.pallets.length;
    palletIndex += 1
  ) {
    const pallet =
      input.pallets[
        palletIndex
      ]

    const savedPallet =
      result.pallets.find(
        (item) =>
          item.pallet_number ===
          palletIndex + 1,
      )

    if (!savedPallet) {
      photoWarnings.push(
        `No se encontró el ID del pallet ${palletIndex + 1} para subir sus fotos.`,
      )

      continue
    }

    const uploadSafely =
      async (
        photoType:
          PhotoType,

        photos:
          PhotoInput[],
      ) => {
        if (
          photos.length ===
          0
        ) {
          return
        }

        try {
          await uploadPhotoCollection(
            result.reception_id,
            savedPallet.pallet_id,
            photoType,
            photos,
          )
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Error desconocido'

          photoWarnings.push(
            `Pallet ${palletIndex + 1}, ${photoType}: ${message}`,
          )
        }
      }

    await uploadSafely(
      'packing_list',
      pallet.photos
        .packingList,
    )

    await uploadSafely(
      'pallet_label',
      pallet.photos
        .palletLabel,
    )

    await uploadSafely(
      'pallet_photo',
      pallet.photos
        .palletPhoto,
    )

    await uploadSafely(
      'bol',
      pallet.photos.bol,
    )

    if (
      pallet.damaged ===
        'Sí'
    ) {
      await uploadSafely(
        'damage',
        pallet.photos
          .damage,
      )
    }
  }

  if (
    photoWarnings.length >
    0
  ) {
    console.warn(
      'La recepción se guardó, pero algunas evidencias no pudieron subirse:',
      photoWarnings,
    )
  }

  const {
    data:
      savedReception,

    error:
      savedReceptionError,
  } = await supabase
    .from('receptions')
    .select('*')
    .eq(
      'id',
      result.reception_id,
    )
    .single()

  if (
    savedReceptionError
  ) {
    throw new Error(
      `La recepción se guardó, pero no pudo recuperarse: ${savedReceptionError.message}`,
    )
  }

  return {
    ...savedReception,

    photo_upload_warnings:
      photoWarnings,
  }
}

async function addSignedUrls(
  photos:
    Omit<
      ReceptionPhoto,
      'signed_url'
    >[],
): Promise<
  ReceptionPhoto[]
> {
  return Promise.all(
    photos.map(
      async (
        photo,
      ) => {
        const {
          data,
          error,
        } =
          await supabase
            .storage
            .from(
              'pallet-evidence',
            )
            .createSignedUrl(
              photo.storage_path,
              60 * 60,
            )

        return {
          ...photo,

          signed_url:
            error
              ? null
              : data
                  .signedUrl,
        }
      },
    ),
  )
}

export async function getReceptionById(
  receptionId: string,
): Promise<ReceptionDetail> {
  const {
    data:
      reception,

    error:
      receptionError,
  } = await supabase
    .from(
      'receptions',
    )
    .select('*')
    .eq(
      'id',
      receptionId,
    )
    .single()

  if (receptionError) {
    throw new Error(
      `Error cargando recepción: ${receptionError.message}`,
    )
  }

  const {
    data:
      palletsData,

    error:
      palletsError,
  } = await supabase
    .from(
      'pallets',
    )
    .select('*')
    .eq(
      'reception_id',
      receptionId,
    )
    .order(
      'pallet_number',
      {
        ascending:
          true,
      },
    )

  if (palletsError) {
    throw new Error(
      `Error cargando pallets: ${palletsError.message}`,
    )
  }

  const pallets =
    palletsData ||
    []

  if (
    pallets.length ===
    0
  ) {
    return {
      ...reception,

      pallets: [],
    } as ReceptionDetail
  }

  const palletIds =
    pallets.map(
      (pallet) =>
        pallet.id,
    )

  const {
    data:
      partsData,

    error:
      partsError,
  } = await supabase
    .from(
      'pallet_parts',
    )
    .select('*')
    .in(
      'pallet_id',
      palletIds,
    )
    .order(
      'created_at',
      {
        ascending:
          true,
      },
    )

  if (partsError) {
    throw new Error(
      `Error cargando números de parte: ${partsError.message}`,
    )
  }

  const {
    data:
      photosData,

    error:
      photosError,
  } = await supabase
    .from(
      'pallet_photos',
    )
    .select('*')
    .in(
      'pallet_id',
      palletIds,
    )
    .order(
      'created_at',
      {
        ascending:
          true,
      },
    )

  if (photosError) {
    throw new Error(
      `Error cargando fotografías: ${photosError.message}`,
    )
  }

  const photosWithUrls =
    await addSignedUrls(
      (
        photosData ||
        []
      ) as Omit<
        ReceptionPhoto,
        'signed_url'
      >[],
    )

  const palletsWithDetails =
    pallets.map(
      (pallet) => ({
        ...pallet,

        parts:
          (
            partsData ||
            []
          ).filter(
            (part) =>
              part.pallet_id ===
              pallet.id,
          ),

        photos:
          photosWithUrls.filter(
            (photo) =>
              photo.pallet_id ===
              pallet.id,
          ),
      }),
    )

  return {
    ...reception,

    pallets:
      palletsWithDetails,
  } as ReceptionDetail
}

export async function updateReception(
  receptionId: string,
  input:
    UpdateReceptionInput,
) {
  const carrierName =
    input.carrier ===
    'Other'
      ? input.otherCarrier
      : input.carrier

  const {
    error,
  } = await supabase
    .from(
      'receptions',
    )
    .update({
      carrier:
        carrierName,

      other_carrier:
        input.carrier ===
        'Other'
          ? input.otherCarrier
          : null,

      trailer:
        input.trailer,

      seal:
        input.seal ||
        null,

      reception_date:
        input.receptionDate,

      reception_time:
        input.receptionTime,

      updated_at:
        new Date()
          .toISOString(),
    })
    .eq(
      'id',
      receptionId,
    )

  if (error) {
    throw new Error(
      `Error actualizando recepción: ${error.message}`,
    )
  }
}

async function replacePalletPhoto(
  receptionId: string,
  palletId: string,
  photoType: PhotoType,
  file: File,
) {
  const {
    data:
      currentPhotos,

    error:
      findError,
  } = await supabase
    .from(
      'pallet_photos',
    )
    .select('*')
    .eq(
      'pallet_id',
      palletId,
    )
    .eq(
      'photo_type',
      photoType,
    )
    .order(
      'created_at',
      {
        ascending:
          true,
      },
    )
    .limit(1)

  if (findError) {
    throw new Error(
      `Error buscando evidencia ${photoType}: ${findError.message}`,
    )
  }

  const currentPhoto =
    currentPhotos?.[0] ||
    null

  const fileName =
    createUniqueFileName(
      photoType,
      file,
      0,
    )

  const newStoragePath =
    [
      receptionId,
      palletId,
      photoType,
      fileName,
    ].join('/')

  const {
    error:
      uploadError,
  } =
    await supabase
      .storage
      .from(
        'pallet-evidence',
      )
      .upload(
        newStoragePath,
        file,
        {
          upsert:
            false,
        },
      )

  if (uploadError) {
    throw new Error(
      `Error reemplazando ${photoType}: ${uploadError.message}`,
    )
  }

  if (
    currentPhoto
  ) {
    const {
      error:
        updatePhotoError,
    } = await supabase
      .from(
        'pallet_photos',
      )
      .update({
        storage_path:
          newStoragePath,
      })
      .eq(
        'id',
        currentPhoto.id,
      )

    if (
      updatePhotoError
    ) {
      throw new Error(
        `Error actualizando referencia de ${photoType}: ${updatePhotoError.message}`,
      )
    }

    const {
      error:
        removeError,
    } =
      await supabase
        .storage
        .from(
          'pallet-evidence',
        )
        .remove([
          currentPhoto
            .storage_path,
        ])

    if (
      removeError
    ) {
      console.warn(
        `No se pudo eliminar el archivo anterior de ${photoType}:`,
        removeError,
      )
    }
  } else {
    const {
      error:
        insertPhotoError,
    } = await supabase
      .from(
        'pallet_photos',
      )
      .insert({
        pallet_id:
          palletId,

        photo_type:
          photoType,

        storage_path:
          newStoragePath,
      })

    if (
      insertPhotoError
    ) {
      throw new Error(
        `Error creando referencia de ${photoType}: ${insertPhotoError.message}`,
      )
    }
  }
}

export async function updateReceptionPallet(
  receptionId: string,
  palletId: string,
  input:
    UpdatePalletInput,
) {
  const {
    error:
      palletError,
  } = await supabase
    .from(
      'pallets',
    )
    .update({
      packing_list_reference:
        input
          .packingListReference ||
        null,

      invoice:
        input.invoice ||
        null,

      damaged:
        input.damaged,

      notes:
        input.notes ||
        null,

      documentation_complete:
        input
          .documentationComplete,

      completed:
        true,
    })
    .eq(
      'id',
      palletId,
    )

  if (palletError) {
    throw new Error(
      `Error actualizando pallet: ${palletError.message}`,
    )
  }

  const {
    error:
      deletePartsError,
  } = await supabase
    .from(
      'pallet_parts',
    )
    .delete()
    .eq(
      'pallet_id',
      palletId,
    )

  if (
    deletePartsError
  ) {
    throw new Error(
      `Error actualizando números de parte: ${deletePartsError.message}`,
    )
  }

  if (
    input.parts.length >
    0
  ) {
    const {
      error:
        insertPartsError,
    } = await supabase
      .from(
        'pallet_parts',
      )
      .insert(
        input.parts.map(
          (part) => ({
            pallet_id:
              palletId,

            part_number:
              part.partNumber,

            quantity:
              Number(
                part.quantity,
              ),

            boxes:
              part.boxes ===
              ''
                ? null
                : Number(
                    part.boxes,
                  ),

            packages:
              part.packages ===
              ''
                ? null
                : Number(
                    part.packages,
                  ),

            pallet_ref:
              part.palletReference
                .trim() ||
              null,
          }),
        ),
      )

    if (
      insertPartsError
    ) {
      throw new Error(
        `Error guardando números de parte actualizados: ${insertPartsError.message}`,
      )
    }
  }

  const replacementPhotos =
    input
      .replacementPhotos

  if (
    replacementPhotos
  ) {
    const replacements: Array<{
      type:
        PhotoType
      file:
        File | null | undefined
    }> = [
      {
        type:
          'packing_list',

        file:
          replacementPhotos
            .packing_list,
      },

      {
        type:
          'pallet_label',

        file:
          replacementPhotos
            .pallet_label,
      },

      {
        type:
          'pallet_photo',

        file:
          replacementPhotos
            .pallet_photo,
      },

      {
        type:
          'bol',

        file:
          replacementPhotos
            .bol,
      },

      {
        type:
          'damage',

        file:
          replacementPhotos
            .damage,
      },
    ]

    for (
      const replacement of
      replacements
    ) {
      if (
        replacement.file
      ) {
        await replacePalletPhoto(
          receptionId,
          palletId,
          replacement.type,
          replacement.file,
        )
      }
    }
  }
}