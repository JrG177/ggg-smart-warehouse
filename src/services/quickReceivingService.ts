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

export type QuickReceptionPackageInput = {
  partNumber: string
  purchaseOrder: string
  quantity: number | null
  supplierCode: string
  supplierPackageId: string
  supplierPackageType: '3S' | '4S' | null
  rawCodes: Record<string, string>
}

export type QuickReceptionProgress = {
  phase: 'optimizing' | 'uploading' | 'saving'
  completed: number
  total: number
}

export type QuickReceptionProgressCallback = (
  progress: QuickReceptionProgress,
) => void

const MAX_IMAGE_DIMENSION = 2400
const JPEG_QUALITY = 0.82
const PHOTO_BATCH_SIZE = 3
const UPLOAD_MAX_ATTEMPTS = 3
const UPLOAD_RETRY_BASE_DELAY_MS = 750

export type QuickReceptionResult = {
  id: string
  reference_number: string
  packages: WarehousePackage[]
}

export type WarehousePackage = {
  id: string
  tracking_code: string
  part_number: string
  purchase_order: string | null
  quantity: number | null
  supplier_code: string | null
  supplier_package_id: string | null
  supplier_package_type: '3S' | '4S' | null
  status: 'received' | 'assigned' | 'shipped'
  created_at: string
}

export type QuickReceptionPhoto = {
  id: string
  photo_type: QuickPhotoType
  storage_path: string
  created_at: string
  signed_url: string
}

export type QuickReceptionHistoryItem = {
  id: string
  reference_number: string
  client: QuickReceptionClient
  status: 'uploading' | 'completed'
  observations: string | null
  created_at: string
  photos: QuickReceptionPhoto[]
  packages: WarehousePackage[]
}

type QuickReceptionHistoryRow = Omit<
  QuickReceptionHistoryItem,
  'photos' | 'packages'
> & {
  quick_reception_photos: Omit<QuickReceptionPhoto, 'signed_url'>[] | null
  warehouse_packages: WarehousePackage[] | null
}

export async function getQuickReceptionHistory() {
  const { data, error } = await supabase
    .from('quick_receptions')
    .select(`
      id,
      reference_number,
      client,
      status,
      observations,
      created_at,
      quick_reception_photos (
        id,
        photo_type,
        storage_path,
        created_at
      ),
      warehouse_packages (
        id,
        tracking_code,
        part_number,
        purchase_order,
        quantity,
        supplier_code,
        supplier_package_id,
        supplier_package_type,
        status,
        created_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw new Error(`No se pudo cargar el historial: ${error.message}`)
  }

  const rows = (data || []) as QuickReceptionHistoryRow[]

  return Promise.all(
    rows.map(async (row) => {
      const photos = await Promise.all(
        (row.quick_reception_photos || []).map(async (photo) => {
          const { data: signedData, error: signedError } =
            await supabase.storage
              .from('quick-reception-evidence')
              .createSignedUrl(photo.storage_path, 60 * 60)

          if (signedError || !signedData?.signedUrl) {
            throw new Error(
              `No se pudo abrir una fotografía: ${signedError?.message || 'URL no disponible'}`,
            )
          }

          return {
            ...photo,
            signed_url: signedData.signedUrl,
          }
        }),
      )

      const {
        quick_reception_photos: _photos,
        warehouse_packages,
        ...reception
      } = row
      void _photos

      return {
        ...reception,
        photos,
        packages: warehouse_packages || [],
      } as QuickReceptionHistoryItem
    }),
  )
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

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('No se pudo preparar la imagen'))
    }

    image.src = objectUrl
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
  })
}

function getJpegFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^/.]+$/, '') || 'photo'
  return `${baseName}.jpg`
}

async function optimizePhoto(file: File) {
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml'
  ) {
    return file
  }

  try {
    const image = await loadImage(file)
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight)
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / longestSide)
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) return file

    canvas.width = width
    canvas.height = height
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    const optimizedBlob = await canvasToJpeg(canvas)

    if (!optimizedBlob || optimizedBlob.size >= file.size) {
      return file
    }

    return new File([optimizedBlob], getJpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

type UploadErrorDetails = {
  message?: string
  status?: number
  statusCode?: number | string
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds)
  })
}

function getUploadStatus(error: unknown) {
  if (!error || typeof error !== 'object') return null

  const details = error as UploadErrorDetails
  const status = Number(details.status ?? details.statusCode)

  return Number.isFinite(status) ? status : null
}

function isAlreadyUploaded(error: unknown) {
  if (!error || typeof error !== 'object') return false

  const message = ((error as UploadErrorDetails).message || '')
    .toLowerCase()

  return (
    message.includes('already exists') ||
    message.includes('duplicate')
  )
}

function isRetryableUploadError(error: unknown) {
  const status = getUploadStatus(error)

  return (
    status === null ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  )
}

async function uploadPhotoWithRetry(
  storagePath: string,
  file: File,
  type: QuickPhotoType,
) {
  let lastError: unknown
  let attemptsUsed = 0

  for (
    let attempt = 1;
    attempt <= UPLOAD_MAX_ATTEMPTS;
    attempt += 1
  ) {
    attemptsUsed = attempt

    const { error: uploadError } = await supabase.storage
      .from('quick-reception-evidence')
      .upload(storagePath, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (!uploadError || isAlreadyUploaded(uploadError)) {
      return
    }

    lastError = uploadError

    if (
      attempt === UPLOAD_MAX_ATTEMPTS ||
      !isRetryableUploadError(uploadError)
    ) {
      break
    }

    await wait(
      UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
    )
  }

  const errorMessage =
    lastError &&
    typeof lastError === 'object' &&
    'message' in lastError
      ? String(lastError.message)
      : 'error de conexión'

  const attemptsMessage =
    attemptsUsed > 1
      ? ` después de ${attemptsUsed} intentos`
      : ''

  throw new Error(
    `No se pudo subir la foto de ${type}${attemptsMessage}: ${errorMessage}`,
  )
}

export async function createQuickReception(
  client: QuickReceptionClient,
  photos: QuickReceptionPhotoInput[],
  observations?: string,
  onProgress?: QuickReceptionProgressCallback,
  packages: QuickReceptionPackageInput[] = [],
) {
  const total = photos.length
  let optimizedCompleted = 0
  const optimizedPhotos: QuickReceptionPhotoInput[] = []

  onProgress?.({ phase: 'optimizing', completed: 0, total })

  for (let index = 0; index < photos.length; index += PHOTO_BATCH_SIZE) {
    const batch = photos.slice(index, index + PHOTO_BATCH_SIZE)
    const optimizedBatch = await Promise.all(
      batch.map(async (photo) => {
        const file = await optimizePhoto(photo.file)
        optimizedCompleted += 1
        onProgress?.({
          phase: 'optimizing',
          completed: optimizedCompleted,
          total,
        })
        return { ...photo, file }
      }),
    )

    optimizedPhotos.push(...optimizedBatch)
  }

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
  const photoRows: Array<{
    quick_reception_id: string
    photo_type: QuickPhotoType
    storage_path: string
  }> = []
  let uploadedCompleted = 0

  onProgress?.({ phase: 'uploading', completed: 0, total })

  try {
    for (
      let index = 0;
      index < optimizedPhotos.length;
      index += PHOTO_BATCH_SIZE
    ) {
      const batch = optimizedPhotos.slice(
        index,
        index + PHOTO_BATCH_SIZE,
      )
      const uploadResults = await Promise.allSettled(
        batch.map(async (photo) => {
          const storagePath = buildStoragePath(
            reception.id,
            photo.type,
            photo.file,
          )

          await uploadPhotoWithRetry(
            storagePath,
            photo.file,
            photo.type,
          )

          return {
            quick_reception_id: reception.id,
            photo_type: photo.type,
            storage_path: storagePath,
          }
        }),
      )

      for (const result of uploadResults) {
        if (result.status === 'fulfilled') {
          uploadedPaths.push(result.value.storage_path)
          photoRows.push(result.value)
          uploadedCompleted += 1
          onProgress?.({
            phase: 'uploading',
            completed: uploadedCompleted,
            total,
          })
        }
      }

      const failedUpload = uploadResults.find(
        (result) => result.status === 'rejected',
      )

      if (failedUpload?.status === 'rejected') {
        throw failedUpload.reason
      }
    }

    onProgress?.({ phase: 'saving', completed: total, total })

    const { error: photoError } = await supabase
      .from('quick_reception_photos')
      .insert(photoRows)

    if (photoError) {
      throw new Error(
        `No se pudo guardar la evidencia: ${photoError.message}`,
      )
    }

    let savedPackages: WarehousePackage[] = []

    if (packages.length > 0) {
      const { data: packageRows, error: packageError } = await supabase
        .from('warehouse_packages')
        .insert(
          packages.map((item) => ({
            quick_reception_id: reception.id,
            part_number: item.partNumber,
            purchase_order: item.purchaseOrder || null,
            quantity: item.quantity,
            supplier_code: item.supplierCode || null,
            supplier_package_id: item.supplierPackageId || null,
            supplier_package_type: item.supplierPackageType,
            raw_codes: item.rawCodes,
          })),
        )
        .select(`
          id,
          tracking_code,
          part_number,
          purchase_order,
          quantity,
          supplier_code,
          supplier_package_id,
          supplier_package_type,
          status,
          created_at
        `)

      if (packageError) {
        throw new Error(
          `No se pudieron guardar los paquetes escaneados: ${packageError.message}`,
        )
      }

      savedPackages = (packageRows || []) as WarehousePackage[]
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

    return {
      ...reception,
      packages: savedPackages,
    } as QuickReceptionResult
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

export async function deleteQuickReception(
  receptionId: string,
  storagePaths: string[],
) {
  const { error: deletionError } = await supabase
    .from('quick_receptions')
    .delete()
    .eq('id', receptionId)

  if (deletionError) {
    throw new Error(
      `No se pudo eliminar la recepción rápida: ${deletionError.message}`,
    )
  }

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('quick-reception-evidence')
      .remove(storagePaths)

    if (storageError) {
      console.error(
        'La recepción se eliminó, pero no se pudieron limpiar todas sus fotos:',
        storageError,
      )
    }
  }
}
