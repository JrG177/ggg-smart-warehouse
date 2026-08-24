import { supabase } from '../lib/supabase'

export type QuickReceptionClient = 'UPS' | 'A1'

export type QuickPhotoType =
  | 'invoice'
  | 'boxes'
  | 'labels'
  | 'part_number_label'
  | 'pallet'

export type QuickReceptionPhotoInput = {
  type: QuickPhotoType
  file: File
}

export type QuickReceptionResult = {
  id: string
  reference_number: string
}

function getExtension(file: File) {
  const extension = file.name.split('.').pop()
  return extension?.toLowerCase() || 'jpg'
}

function buildStoragePath(
  receptionId: string,
  type: QuickPhotoType,
  file: File,
) {
  const uniquePart = `${Date.now()}-${crypto.randomUUID()}`
  return `${receptionId}/${type}/${uniquePart}.${getExtension(file)}`
}

export async function createQuickReception(
  client: QuickReceptionClient,
  photos: QuickReceptionPhotoInput[],
  observations?: string,
) {
  const { data: reception, error: receptionError } = await supabase
    .from('quick_receptions')
    .insert({
      client,
      status: 'uploading',
      observations: observations?.trim() || null,
    })
    .select('id, reference_number')
    .single()

  if (receptionError || !reception) {
    throw new Error(
      `No se pudo crear la recepción rápida: ${receptionError?.message || 'respuesta vacía'}`,
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

      const { error: uploadError } = await supabase.storage
        .from('quick-reception-evidence')
        .upload(storagePath, photo.file, {
          cacheControl: '3600',
          contentType: photo.file.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(
          `No se pudo subir la foto de ${photo.type}: ${uploadError.message}`,
        )
      }

      uploadedPaths.push(storagePath)

      const { error: photoError } = await supabase
        .from('quick_reception_photos')
        .insert({
          quick_reception_id: reception.id,
          photo_type: photo.type,
          storage_path: storagePath,
        })

      if (photoError) {
        throw new Error(
          `No se pudo guardar la evidencia de ${photo.type}: ${photoError.message}`,
        )
      }
    }

    const { error: completionError } = await supabase
      .from('quick_receptions')
      .update({ status: 'completed' })
      .eq('id', reception.id)

    if (completionError) {
      throw new Error(
        `Las fotos subieron, pero no se pudo completar la recepción: ${completionError.message}`,
      )
    }

    return reception as QuickReceptionResult
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