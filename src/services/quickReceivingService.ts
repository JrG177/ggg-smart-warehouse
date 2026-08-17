import { supabase } from '../lib/supabase'

export type QuickReceptionClient = 'UPS' | 'A1'

export type QuickPhotoType =
  | 'invoice'
  | 'boxes'
  | 'labels'
  | 'pallet'

export type QuickReceptionPhotoInput = {
  type: QuickPhotoType
  file: File
}

function getExtension(file: File) {
  return (
    file.name.split('.').pop()?.toLowerCase() ||
    'jpg'
  )
}

function buildStoragePath(
  receptionId: string,
  type: QuickPhotoType,
  file: File,
) {
  const uniquePart =
    `${Date.now()}-${crypto.randomUUID()}`

  return `${receptionId}/${type}/${uniquePart}.${getExtension(file)}`
}

export async function createQuickReception(
  client: QuickReceptionClient,
  photos: QuickReceptionPhotoInput[],
) {
  const {
    data: reception,
    error: receptionError,
  } = await supabase
    .from('quick_receptions')
    .insert({
      client,
      status: 'uploading',
    })
    .select('id, reference_number')
    .single()

  if (receptionError || !reception) {
    throw new Error(
      `No se pudo crear la recepción rápida: ${
        receptionError?.message ||
        'respuesta vacía'
      }`,
    )
  }

  const uploadedPaths: string[] = []

  try {
    for (const photo of photos) {
      const storagePath = buildStoragePath(
        reception.id,
        photo.type,
        photo.file,
      )

      const { error: uploadError } =
        await supabase.storage
          .from('quick-reception-evidence')
          .upload(
            storagePath,
            photo.file,
            {
              cacheControl: '3600',
              contentType:
                photo.file.type ||
                'image/jpeg',
              upsert: false,
            },
          )

      if (uploadError) {
        throw new Error(
          `No se pudo subir ${photo.type}: ${uploadError.message}`,
        )
      }

      uploadedPaths.push(storagePath)

      const { error: photoError } =
        await supabase
          .from('quick_reception_photos')
          .insert({
            quick_reception_id:
              reception.id,
            photo_type: photo.type,
            storage_path: storagePath,
          })

      if (photoError) {
        throw new Error(
          `No se pudo guardar ${photo.type}: ${photoError.message}`,
        )
      }
    }

    const { error: completionError } =
      await supabase
        .from('quick_receptions')
        .update({
          status: 'completed',
        })
        .eq('id', reception.id)

    if (completionError) {
      throw new Error(
        `No se pudo completar la recepción: ${completionError.message}`,
      )
    }

    return reception
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await supabase.storage
        .from('quick-reception-evidence')
        .remove(uploadedPaths)
    }

    await supabase
      .from('quick_receptions')
      .delete()
      .eq('id', reception.id)

    throw error
  }
}