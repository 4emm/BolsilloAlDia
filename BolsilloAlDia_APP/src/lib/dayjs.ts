import dayjs from 'dayjs';
import 'dayjs/locale/es';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';
import relativeTime from 'dayjs/plugin/relativeTime';

/**
 * dayjs configurado una sola vez (agrupación por día, semana y mes: requisito del proyecto).
 * - isoWeek: la semana va de lunes a domingo, como se usa en Colombia.
 * - customParseFormat: validación estricta de fechas AAAA-MM-DD.
 */
dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);
dayjs.extend(relativeTime);
dayjs.locale('es');

export { dayjs };
export const DATE_FORMAT = 'YYYY-MM-DD';
